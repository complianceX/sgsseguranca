import {
  CallHandler,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { AprsController } from './aprs.controller';
import { AprsService } from './aprs.service';

describe('AprsController (http)', () => {
  const aprId = '11111111-1111-4111-8111-111111111111';
  let currentUser: { userId?: string; id?: string } = { userId: 'user-1' };
  let app: INestApplication;

  const aprsService = {
    attachPdf: jest.fn(),
    findOne: jest.fn(),
    getPdfAccess: jest.fn(),
  };
  const pdfRateLimitService = {
    checkDownloadLimit: jest.fn(),
  };

  beforeEach(() => {
    currentUser = { userId: 'user-1' };
    aprsService.attachPdf.mockReset();
    aprsService.findOne.mockReset();
    aprsService.getPdfAccess.mockReset();
    pdfRateLimitService.checkDownloadLimit.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AprsController],
      providers: [
        { provide: AprsService, useValue: aprsService },
        { provide: PdfRateLimitService, useValue: pdfRateLimitService },
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

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('encaminha o userId explicito ao anexar o PDF final da APR', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    aprsService.attachPdf.mockResolvedValue({
      fileKey: 'documents/company-1/aprs/apr-1/apr-final.pdf',
      folderPath: 'aprs/company-1',
      originalName: 'apr-final.pdf',
    });

    await request(httpServer)
      .post(`/aprs/${aprId}/file`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'apr-final.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(aprsService.attachPdf).toHaveBeenCalledWith(
      aprId,
      expect.objectContaining({
        originalname: 'apr-final.pdf',
        mimetype: 'application/pdf',
      }),
      'user-1',
    );
  });

  it('nao consome o rate limit ao abrir os dados da APR', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    aprsService.findOne.mockResolvedValue({
      id: aprId,
      numero: 'APR-001',
    });

    await request(httpServer).get(`/aprs/${aprId}`).expect(200);

    expect(pdfRateLimitService.checkDownloadLimit).not.toHaveBeenCalled();
    expect(aprsService.findOne).toHaveBeenCalledWith(aprId);
  });

  it('consome o rate limit ao solicitar o acesso ao PDF final da APR', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    aprsService.getPdfAccess.mockResolvedValue({
      entityId: aprId,
      fileKey: 'documents/company-1/aprs/apr-1/apr-final.pdf',
      folderPath: 'aprs/company-1',
      originalName: 'apr-final.pdf',
      url: 'https://storage.example/apr-final.pdf',
    });

    await request(httpServer)
      .get(`/aprs/${aprId}/pdf`)
      .expect(200)
      .expect(({ body }) => {
        const payload = body as { url?: string };
        expect(payload.url).toBe('https://storage.example/apr-final.pdf');
      });

    expect(pdfRateLimitService.checkDownloadLimit).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
    expect(aprsService.getPdfAccess).toHaveBeenCalledWith(aprId);
  });
});
