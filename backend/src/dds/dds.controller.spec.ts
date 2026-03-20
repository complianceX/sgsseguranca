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
import { DdsController } from './dds.controller';
import { DdsService } from './dds.service';

describe('DdsController (http)', () => {
  const ddsId = '11111111-1111-4111-8111-111111111111';
  let currentUser: { userId?: string; id?: string } = { userId: 'user-1' };
  let app: INestApplication;

  const ddsService = {
    create: jest.fn(),
    getPdfAccess: jest.fn(),
  };
  const pdfRateLimitService = {
    checkDownloadLimit: jest.fn(),
  };

  beforeEach(() => {
    currentUser = { userId: 'user-1' };
    ddsService.create.mockReset();
    ddsService.getPdfAccess.mockReset();
    pdfRateLimitService.checkDownloadLimit.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DdsController],
      providers: [
        { provide: DdsService, useValue: ddsService },
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

  it('retorna 400 quando participants do createWithFile nao vier como JSON valido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/dds/with-file')
      .field('tema', 'DDS teste')
      .field('data', '2026-03-16')
      .field('site_id', '11111111-1111-4111-8111-111111111111')
      .field('facilitador_id', '22222222-2222-4222-8222-222222222222')
      .field('participants', 'not-json')
      .expect(400)
      .expect(({ body }) => {
        expect((body as { message?: string }).message).toBe(
          'O campo participants deve ser um JSON valido.',
        );
      });

    expect(ddsService.create).not.toHaveBeenCalled();
  });

  it('retorna 410 quando tentam usar o endpoint legado with-file para anexar PDF inicial', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/dds/with-file')
      .field('tema', 'DDS teste')
      .field('data', '2026-03-16')
      .field('site_id', '11111111-1111-4111-8111-111111111111')
      .field('facilitador_id', '22222222-2222-4222-8222-222222222222')
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'dds-final.pdf',
        contentType: 'application/pdf',
      })
      .expect(410)
      .expect(({ body }) => {
        expect((body as { message?: string }).message).toBe(
          'O endpoint legado /dds/with-file não aceita mais PDF inicial. Use POST /dds para criar, PUT /dds/:id/signatures para assinaturas/fotos e POST /dds/:id/file para o PDF final.',
        );
      });

    expect(ddsService.create).not.toHaveBeenCalled();
  });

  it('aplica rate limit ao acessar o PDF final governado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsService.getPdfAccess.mockResolvedValue({
      ddsId,
      hasFinalPdf: true,
      availability: 'ready',
      message: 'PDF final governado disponível para acesso.',
      degraded: false,
      fileKey: 'documents/company-1/dds/dds-1/dds-final.pdf',
      folderPath: 'dds/company-1',
      originalName: 'dds-final.pdf',
      url: 'https://example.com/dds-final.pdf',
    });

    await request(httpServer)
      .get(`/dds/${ddsId}/pdf`)
      .expect(200)
      .expect(({ body }) => {
        const payload = body as { url?: string };
        expect(payload.url).toBe('https://example.com/dds-final.pdf');
      });

    expect(pdfRateLimitService.checkDownloadLimit).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
    );
    expect(ddsService.getPdfAccess).toHaveBeenCalledWith(ddsId);
  });
});
