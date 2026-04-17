import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  INestApplication,
  Logger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantInterceptor } from '../../common/tenant/tenant.interceptor';
import { TenantService } from '../../common/tenant/tenant.service';
import { DocumentImportController } from './document-import.controller';
import { DocumentImportService } from '../services/document-import.service';
import { FileInspectionService } from '../../common/security/file-inspection.service';

jest.setTimeout(15000);

describe('DocumentImportController (http)', () => {
  let app: INestApplication;
  let loggerErrorSpy: jest.SpyInstance;
  let currentUser: { company_id?: string; userId?: string; id?: string } = {
    company_id: 'company-1',
    userId: 'user-1',
  };

  const documentImportService = {
    enqueueDocumentProcessing: jest.fn(),
    getDocumentStatusResponse: jest.fn(),
  };

  beforeEach(() => {
    currentUser = {
      company_id: 'company-1',
      userId: 'user-1',
    };
    documentImportService.enqueueDocumentProcessing.mockReset();
    documentImportService.getDocumentStatusResponse.mockReset();
  });

  beforeAll(async () => {
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentImportController],
      providers: [
        {
          provide: DocumentImportService,
          useValue: documentImportService,
        },
        {
          provide: TenantService,
          useValue: {
            getTenantId: jest.fn(() => 'company-1'),
            isSuperAdmin: jest.fn(() => false),
          },
        },
        {
          provide: FileInspectionService,
          useValue: { inspect: jest.fn().mockResolvedValue({ safe: true }) },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: typeof currentUser;
          }>();
          req.user = currentUser;
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (
          _context: ExecutionContext,
          next: CallHandler,
        ): Observable<unknown> => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    loggerErrorSpy.mockRestore();
  });

  it('recebe o upload e retorna 202 com status consultável', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.enqueueDocumentProcessing.mockResolvedValue({
      success: true,
      queued: true,
      documentId: 'doc-1',
      status: 'QUEUED',
      statusUrl: '/documents/import/doc-1/status',
      reused: false,
      replayState: 'new',
      idempotencyKey: 'idem-1',
      message: 'Documento recebido e enviado para processamento assíncrono.',
      job: {
        jobId: 'job-1',
        queueState: 'waiting',
        attemptsMade: 0,
        maxAttempts: 3,
        deadLettered: false,
      },
    });

    await request(httpServer)
      .post('/documents/import')
      .set('Idempotency-Key', 'idem-1')
      .field('tipoDocumento', 'APR')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'apr.pdf',
        contentType: 'application/pdf',
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          queued: true,
          documentId: 'doc-1',
          status: 'QUEUED',
          statusUrl: '/documents/import/doc-1/status',
        });
      });

    expect(
      documentImportService.enqueueDocumentProcessing,
    ).toHaveBeenCalledWith(
      expect.any(Buffer),
      'company-1',
      'APR',
      'application/pdf',
      'apr.pdf',
      'user-1',
      'idem-1',
    );
  });

  it('expõe o endpoint de consulta de status da importação', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.getDocumentStatusResponse.mockResolvedValue({
      success: true,
      documentId: 'doc-1',
      status: 'PROCESSING',
      completed: false,
      failed: false,
      statusUrl: '/documents/import/doc-1/status',
      message: 'Documento em extração de conteúdo.',
      job: {
        jobId: 'job-1',
        queueState: 'active',
        attemptsMade: 1,
        maxAttempts: 3,
        deadLettered: false,
      },
    });

    await request(httpServer)
      .get('/documents/import/11111111-1111-4111-8111-111111111111/status')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          documentId: 'doc-1',
          status: 'PROCESSING',
          job: {
            queueState: 'active',
          },
        });
      });

    expect(
      documentImportService.getDocumentStatusResponse,
    ).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });

  it('preserva erro conhecido de validação do upload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.enqueueDocumentProcessing.mockRejectedValue(
      new BadRequestException('Documento duplicado.'),
    );

    await request(httpServer)
      .post('/documents/import')
      .field('tipoDocumento', 'APR')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'apr.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
      .expect(({ body }) => {
        const payload = body as { message?: string };
        expect(payload.message).toBe('Documento duplicado.');
      });
  });
});
