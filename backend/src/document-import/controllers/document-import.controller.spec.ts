import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  INestApplication,
  Logger,
  ValidationPipe,
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
  let currentUser: {
    company_id?: string;
    companyId?: string;
    userId?: string;
    id?: string;
  } = {
    company_id: 'company-1',
    userId: 'user-1',
  };

  const tenantService: {
    getTenantId: jest.Mock<string | undefined, []>;
    isSuperAdmin: jest.Mock<boolean, []>;
  } = {
    getTenantId: jest.fn(() => 'company-1'),
    isSuperAdmin: jest.fn(() => false),
  };

  const documentImportService = {
    enqueueDocumentProcessing: jest.fn(),
    getDocumentStatusResponse: jest.fn(),
    getDdsDraftPreview: jest.fn(),
    createDdsDraftFromImport: jest.fn(),
  };

  beforeEach(() => {
    currentUser = {
      company_id: 'company-1',
      userId: 'user-1',
    };
    documentImportService.enqueueDocumentProcessing.mockReset();
    documentImportService.getDocumentStatusResponse.mockReset();
    documentImportService.getDdsDraftPreview.mockReset();
    documentImportService.createDdsDraftFromImport.mockReset();
    tenantService.getTenantId.mockReset();
    tenantService.getTenantId.mockReturnValue('company-1');
    tenantService.isSuperAdmin.mockReset();
    tenantService.isSuperAdmin.mockReturnValue(false);
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
          useValue: tenantService,
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
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
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
    ).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'company-1');
  });

  it('retorna 404 genérico quando o status não existe no tenant resolvido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.getDocumentStatusResponse.mockResolvedValue(null);

    await request(httpServer)
      .get('/documents/import/11111111-1111-4111-8111-111111111111/status')
      .expect(404)
      .expect(({ body }) => {
        const payload = body as { message?: string };
        expect(payload.message).toBe('Documento não encontrado.');
      });

    expect(
      documentImportService.getDocumentStatusResponse,
    ).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'company-1');
  });

  it('exige tenant resolvido para consultar status', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    currentUser = { userId: 'user-1' };
    tenantService.getTenantId.mockReturnValue(undefined);

    await request(httpServer)
      .get('/documents/import/11111111-1111-4111-8111-111111111111/status')
      .expect(400)
      .expect(({ body }) => {
        const payload = body as { message?: string };
        expect(payload.message).toContain(
          'Contexto de empresa não identificado.',
        );
      });

    expect(
      documentImportService.getDocumentStatusResponse,
    ).not.toHaveBeenCalled();
  });

  it('expõe prévia DDS tenant-scoped de importação concluída', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.getDdsDraftPreview.mockResolvedValue({
      documentId: '11111111-1111-4111-8111-111111111111',
      preview: {
        tema: 'DDS Importado',
        conteudo: 'Conteúdo extraído',
        data: '2026-03-20',
        participantesSugeridos: ['Ana TST'],
        pendencias: [],
      },
    });

    await request(httpServer)
      .get('/documents/import/11111111-1111-4111-8111-111111111111/dds-draft')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          documentId: '11111111-1111-4111-8111-111111111111',
          preview: {
            tema: 'DDS Importado',
          },
        });
      });

    expect(documentImportService.getDdsDraftPreview).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'company-1',
    );
  });

  it('cria rascunho DDS a partir da importação somente com payload validado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.createDdsDraftFromImport.mockResolvedValue({
      documentId: '11111111-1111-4111-8111-111111111111',
      ddsId: '22222222-2222-4222-8222-222222222222',
      status: 'rascunho',
    });

    await request(httpServer)
      .post('/documents/import/11111111-1111-4111-8111-111111111111/dds-draft')
      .send({
        tema: 'DDS Validado',
        conteudo: 'Conteúdo validado',
        data: '2026-03-20',
        site_id: '33333333-3333-4333-8333-333333333333',
        facilitador_id: '44444444-4444-4444-8444-444444444444',
        participants: ['55555555-5555-4555-8555-555555555555'],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          ddsId: '22222222-2222-4222-8222-222222222222',
          status: 'rascunho',
        });
      });

    expect(documentImportService.createDdsDraftFromImport).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'company-1',
      expect.objectContaining({
        tema: 'DDS Validado',
        site_id: '33333333-3333-4333-8333-333333333333',
      }),
    );
  });

  it('retorna 404 genérico quando prévia DDS não existe no tenant', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentImportService.getDdsDraftPreview.mockResolvedValue(null);

    await request(httpServer)
      .get('/documents/import/11111111-1111-4111-8111-111111111111/dds-draft')
      .expect(404)
      .expect(({ body }) => {
        const payload = body as { message?: string };
        expect(payload.message).toBe('Documento não encontrado.');
      });
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

  it('rejeita empresaId no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/documents/import')
      .field('tipoDocumento', 'APR')
      .field('empresaId', '11111111-1111-4111-8111-111111111111')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'apr.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
      .expect(({ body }) => {
        const payload = body as { message?: string[] };
        expect(payload.message).toContain(
          'empresaId não é mais aceito no payload. Use o header x-company-id.',
        );
      });

    expect(
      documentImportService.enqueueDocumentProcessing,
    ).not.toHaveBeenCalled();
  });

  it('rejeita tipoDocumento fora do contrato permitido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/documents/import')
      .field('tipoDocumento', 'ARBITRARIO')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'apr.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
      .expect(({ body }) => {
        const payload = body as { message?: string[] };
        expect(payload.message).toContain(
          'Tipo de documento inválido para importação.',
        );
      });
  });
});
