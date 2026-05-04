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
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { DdsController } from './dds.controller';
import { DdsApprovalService } from './dds-approval.service';
import { DdsObservabilityAlertsService } from './dds-observability-alerts.service';
import { DdsObservabilityService } from './dds-observability.service';
import { DdsService } from './dds.service';

jest.setTimeout(15000);

describe('DdsController (http)', () => {
  const ddsId = '11111111-1111-4111-8111-111111111111';
  let currentUser: { userId?: string; id?: string; companyId?: string } = {
    userId: 'user-1',
    companyId: 'company-1',
  };
  let app: INestApplication;

  const ddsService = {
    create: jest.fn(),
    getPdfAccess: jest.fn(),
    getHistoricalPhotoHashes: jest.fn(),
    listSignatures: jest.fn(),
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };
  const ddsApprovalService = {
    getFlow: jest.fn(),
    initializeFlow: jest.fn(),
    reopenFlow: jest.fn(),
    approveStep: jest.fn(),
    rejectStep: jest.fn(),
  };
  const ddsObservabilityService = {
    getOverview: jest.fn(),
  };
  const ddsObservabilityAlertsService = {
    getPreview: jest.fn(),
    dispatch: jest.fn(),
  };
  const pdfRateLimitService = {
    checkDownloadLimit: jest.fn(),
  };

  beforeEach(() => {
    currentUser = { userId: 'user-1', companyId: 'company-1' };
    jest.clearAllMocks();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DdsController],
      providers: [
        { provide: DdsService, useValue: ddsService },
        { provide: DdsApprovalService, useValue: ddsApprovalService },
        { provide: DdsObservabilityService, useValue: ddsObservabilityService },
        {
          provide: DdsObservabilityAlertsService,
          useValue: ddsObservabilityAlertsService,
        },
        { provide: PdfRateLimitService, useValue: pdfRateLimitService },
        { provide: FileInspectionService, useValue: { inspect: jest.fn() } },
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

  it('retorna 410 quando tentam usar o endpoint legado with-file mesmo sem arquivo', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/dds/with-file')
      .field('tema', 'DDS teste')
      .field('data', '2026-03-16')
      .field('site_id', '11111111-1111-4111-8111-111111111111')
      .field('facilitador_id', '22222222-2222-4222-8222-222222222222')
      .field('participants', 'not-json')
      .expect(410)
      .expect(({ body }) => {
        expect((body as { message?: string }).message).toBe(
          'O endpoint legado /dds/with-file foi removido. Use POST /dds para criar, PUT /dds/:id/signatures para assinaturas/fotos e POST /dds/:id/file para o PDF final.',
        );
      });

    expect(ddsService.create).not.toHaveBeenCalled();
  });

  it('emite DDS pelo fluxo atual sem aceitar empresa no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const payload = {
      tema: 'DDS Trabalho em Altura',
      data: '2026-04-28',
      conteudo: 'Alinhamento de riscos, barreiras e permissões do turno.',
      site_id: '11111111-1111-4111-8111-111111111111',
      facilitador_id: '22222222-2222-4222-8222-222222222222',
      participants: ['33333333-3333-4333-8333-333333333333'],
    };
    ddsService.create.mockResolvedValue({
      id: ddsId,
      ...payload,
      company_id: 'company-1',
      status: 'rascunho',
    });

    await request(httpServer)
      .post('/dds')
      .send(payload)
      .expect(201)
      .expect(({ body }) => {
        expect((body as { id?: string }).id).toBe(ddsId);
        expect((body as { company_id?: string }).company_id).toBe('company-1');
      });

    expect(ddsService.create).toHaveBeenCalledWith(payload);
    expect(ddsService.create).toHaveBeenCalledTimes(1);
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
          'O endpoint legado /dds/with-file foi removido. Use POST /dds para criar, PUT /dds/:id/signatures para assinaturas/fotos e POST /dds/:id/file para o PDF final.',
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

  it('expõe o overview interno de observabilidade DDS', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsObservabilityService.getOverview.mockResolvedValue({
      generatedAt: '2026-04-18T10:00:00.000Z',
      tenantScope: 'tenant',
      portfolio: { total: 10 },
    });

    await request(httpServer)
      .get('/dds/observability/overview')
      .expect(200)
      .expect(({ body }) => {
        expect((body as { tenantScope?: string }).tenantScope).toBe('tenant');
      });

    expect(ddsObservabilityService.getOverview).toHaveBeenCalled();
  });

  it('expõe preview de alertas operacionais DDS', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsObservabilityAlertsService.getPreview.mockResolvedValue({
      alerts: [{ code: 'dds_public_suspicious_spike' }],
    });

    await request(httpServer)
      .get('/dds/observability/alerts')
      .expect(200)
      .expect(({ body }) => {
        expect(
          (body as { alerts?: Array<{ code?: string }> }).alerts?.[0]?.code,
        ).toBe('dds_public_suspicious_spike');
      });

    expect(ddsObservabilityAlertsService.getPreview).toHaveBeenCalledWith(
      'company-1',
    );
  });

  it('permite disparo manual dos alertas DDS', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsObservabilityAlertsService.dispatch.mockResolvedValue({
      dispatched: true,
    });

    await request(httpServer)
      .post('/dds/observability/alerts/dispatch')
      .expect(201)
      .expect(({ body }) => {
        expect((body as { dispatched?: boolean }).dispatched).toBe(true);
      });

    expect(ddsObservabilityAlertsService.dispatch).toHaveBeenCalledWith(
      'company-1',
    );
  });

  it('ignora company_id do client ao consultar hashes históricos', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsService.getHistoricalPhotoHashes.mockResolvedValue([]);

    await request(httpServer)
      .get(
        '/dds/historical-photo-hashes?limit=25&exclude_id=dds-9&company_id=spoofed',
      )
      .expect(200);

    expect(ddsService.getHistoricalPhotoHashes).toHaveBeenCalledWith(
      25,
      'dds-9',
    );
  });

  it('lista assinaturas do DDS pela rota do modulo', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsService.listSignatures.mockResolvedValue([
      {
        id: 'signature-1',
        document_id: ddsId,
        document_type: 'DDS',
      },
    ]);

    await request(httpServer)
      .get(`/dds/${ddsId}/signatures`)
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        const signatures = body as Array<{
          id: string;
          document_id: string;
          document_type: string;
        }>;
        expect(signatures).toHaveLength(1);
        expect(signatures[0]).toMatchObject({
          id: 'signature-1',
          document_id: ddsId,
          document_type: 'DDS',
        });
      });

    expect(ddsService.listSignatures).toHaveBeenCalledWith(ddsId);
  });

  it('encaminha company_id na listagem de arquivos governados', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/dds/files/list?company_id=spoofed&year=2026&week=12')
      .expect(200);

    expect(ddsService.listStoredFiles).toHaveBeenCalledWith({
      companyId: 'spoofed',
      year: 2026,
      week: 12,
    });
  });

  it('encaminha company_id no weekly bundle governado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    ddsService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('%PDF-dds-bundle'),
      fileName: 'dds-semana-12.pdf',
    });

    await request(httpServer)
      .get('/dds/files/weekly-bundle?company_id=spoofed&year=2026&week=12')
      .expect(200);

    expect(ddsService.getWeeklyBundle).toHaveBeenCalledWith({
      companyId: 'spoofed',
      year: 2026,
      week: 12,
    });
  });
});
