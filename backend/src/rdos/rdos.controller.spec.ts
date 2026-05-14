/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
  StreamableFile,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';

describe('RdosController (http)', () => {
  let app: INestApplication;
  let pdfRateLimitService: { checkDownloadLimit: jest.Mock };

  const rdosService = {
    create: jest.fn(),
    listFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
    downloadPdf: jest.fn(),
    getActivityPhotoAccess: jest.fn(),
    getVideoAttachmentAccess: jest.fn(),
  };

  beforeEach(() => {
    rdosService.create.mockReset();
    rdosService.listFiles.mockReset();
    rdosService.getWeeklyBundle.mockReset();
    rdosService.downloadPdf.mockReset();
    rdosService.getActivityPhotoAccess.mockReset();
    rdosService.getVideoAttachmentAccess.mockReset();
    pdfRateLimitService.checkDownloadLimit.mockReset();
  });

  beforeAll(async () => {
    pdfRateLimitService = {
      checkDownloadLimit: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [RdosController],
      providers: [
        {
          provide: RdosService,
          useValue: rdosService,
        },
        {
          provide: PdfRateLimitService,
          useValue: pdfRateLimitService,
        },
        { provide: FileInspectionService, useValue: { inspect: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
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
  });

  it('ignora company_id do client na listagem de arquivos do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.listFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/rdos/files/list')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '20',
      })
      .expect(200);

    expect(rdosService.listFiles).toHaveBeenCalledWith({
      year: 2026,
      week: 20,
    });
  });

  it('ignora company_id do client no bundle semanal do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('rdo bundle'),
      fileName: 'rdos.pdf',
    });

    await request(httpServer)
      .get('/rdos/files/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '20',
      })
      .expect(200);

    expect(rdosService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 20,
    });
  });

  it('rejeita ano inválido na listagem de arquivos do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/rdos/files/list')
      .query({ year: '20xx', week: '20' })
      .expect(400);

    expect(rdosService.listFiles).not.toHaveBeenCalled();
  });

  it('rejeita semana inválida no bundle semanal do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/rdos/files/weekly-bundle')
      .query({ year: '2026', week: '99' })
      .expect(400);

    expect(rdosService.getWeeklyBundle).not.toHaveBeenCalled();
  });

  it('rejeita company_id forjado na criação de RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/rdos')
      .send({
        data: '2026-04-23T10:00:00.000Z',
        company_id: '11111111-1111-4111-8111-111111111111',
      })
      .expect(400);

    expect(rdosService.create).not.toHaveBeenCalled();
  });

  it('cria RDO válido sem tenant no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.create.mockResolvedValue({ id: 'rdo-1' });

    await request(httpServer)
      .post('/rdos')
      .send({
        data: '2026-04-23T10:00:00.000Z',
      })
      .expect(201);

    expect(rdosService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: '2026-04-23T10:00:00.000Z',
      }),
    );
    expect(rdosService.create.mock.calls[0][0].company_id).toBeUndefined();
  });

  it('aplica rate limit nos acessos governados de fotos e videos do RDO', async () => {
    const controller = app.get(RdosController);
    const req = {
      ip: '127.0.0.1',
      user: { id: 'user-1' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;

    rdosService.getActivityPhotoAccess.mockResolvedValue({ url: null });
    rdosService.getVideoAttachmentAccess.mockResolvedValue({ url: null });

    await controller.getActivityPhotoAccess(
      '11111111-1111-4111-8111-111111111111',
      0,
      0,
      req,
    );

    await controller.getVideoAttachmentAccess(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      req,
    );

    expect(pdfRateLimitService.checkDownloadLimit).toHaveBeenNthCalledWith(
      1,
      'user-1',
      '127.0.0.1',
    );
    expect(pdfRateLimitService.checkDownloadLimit).toHaveBeenNthCalledWith(
      2,
      'user-1',
      '127.0.0.1',
    );
    expect(rdosService.getActivityPhotoAccess).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      0,
      0,
    );
    expect(rdosService.getVideoAttachmentAccess).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );
  });

  it('faz stream do PDF oficial do RDO pela rota de download governada', async () => {
    const controller = app.get(RdosController);
    const req = {
      ip: '127.0.0.1',
      user: { id: 'user-1' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;
    rdosService.downloadPdf.mockResolvedValue({
      buffer: Buffer.from('%PDF-rdo'),
      fileName: 'RDO-RDO-202603-001.pdf',
    });

    const result = await controller.downloadPdf(
      '11111111-1111-4111-8111-111111111111',
      req,
    );

    expect(pdfRateLimitService.checkDownloadLimit).toHaveBeenCalledWith(
      'user-1',
      '127.0.0.1',
    );
    expect(rdosService.downloadPdf).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
