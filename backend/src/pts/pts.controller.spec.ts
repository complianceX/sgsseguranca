import {
  BadRequestException,
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
import { PtsController } from './pts.controller';
import { PtsService } from './pts.service';

describe('PtsController attachFile (http)', () => {
  const ptId = '11111111-1111-4111-8111-111111111111';
  let currentUser: { userId?: string; id?: string } = { userId: 'user-1' };
  let app: INestApplication;

  const ptsService = {
    attachPdf: jest.fn(),
  };
  const pdfRateLimitService = {
    checkDownloadLimit: jest.fn(),
  };

  beforeEach(() => {
    currentUser = { userId: 'user-1' };
    ptsService.attachPdf.mockReset();
    pdfRateLimitService.checkDownloadLimit.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PtsController],
      providers: [
        {
          provide: PtsService,
          useValue: ptsService,
        },
        {
          provide: PdfRateLimitService,
          useValue: pdfRateLimitService,
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

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('anexa o PDF final quando a PT ja esta aprovada e encaminha userId explicitamente', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ptsService.attachPdf.mockResolvedValue({
      fileKey: 'documents/company-1/pts/pt-1/pt-final.pdf',
      folderPath: 'pts/company-1',
      originalName: 'pt-final.pdf',
    });

    await request(httpServer)
      .post(`/pts/${ptId}/file`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'pt-final.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          fileKey: 'documents/company-1/pts/pt-1/pt-final.pdf',
          folderPath: 'pts/company-1',
          originalName: 'pt-final.pdf',
        });
      });

    expect(ptsService.attachPdf).toHaveBeenCalledWith(
      ptId,
      expect.objectContaining({
        originalname: 'pt-final.pdf',
        mimetype: 'application/pdf',
      }),
      'user-1',
    );
  });

  it('usa req.user.id como fallback explicito quando userId nao existir', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    currentUser = { id: 'legacy-user-1' };
    ptsService.attachPdf.mockResolvedValue({
      fileKey: 'documents/company-1/pts/pt-1/pt-final.pdf',
      folderPath: 'pts/company-1',
      originalName: 'pt-final.pdf',
    });

    await request(httpServer)
      .post(`/pts/${ptId}/file`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'pt-final.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(ptsService.attachPdf).toHaveBeenCalledWith(
      ptId,
      expect.objectContaining({
        originalname: 'pt-final.pdf',
      }),
      'legacy-user-1',
    );
  });

  it('retorna 400 quando a PT ainda nao esta aprovada para anexo final', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ptsService.attachPdf.mockRejectedValue(
      new BadRequestException(
        'A PT precisa estar aprovada antes do anexo do PDF final.',
      ),
    );

    await request(httpServer)
      .post(`/pts/${ptId}/file`)
      .attach('file', Buffer.from('%PDF-1.4 test'), {
        filename: 'pt-final.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
      .expect(({ body }) => {
        const payload = body as { message?: string };
        expect(payload.message).toBe(
          'A PT precisa estar aprovada antes do anexo do PDF final.',
        );
      });

    expect(ptsService.attachPdf).toHaveBeenCalledWith(
      ptId,
      expect.any(Object),
      'user-1',
    );
  });
});
