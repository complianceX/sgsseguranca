import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AiConsentGuard } from '../common/guards/ai-consent.guard';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { AiController } from './ai.controller';
import { SophieFacadeService } from './sophie-facade.service';

describe('AiController assisted tenant hardening', () => {
  let app: INestApplication;
  const sophieFacade = {
    generateAprDraft: jest.fn(),
    generatePtDraft: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sophieFacade.generateAprDraft.mockResolvedValue({ draft: {} });
    sophieFacade.generatePtDraft.mockResolvedValue({ draft: {} });
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: SophieFacadeService, useValue: sophieFacade }],
    })
      .overrideGuard(FeatureAiGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AiConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
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

  it('rejeita company_id no rascunho assistido de APR', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/ai/generate-apr-draft')
      .send({
        site_id: '11111111-1111-4111-8111-111111111111',
        elaborador_id: '22222222-2222-4222-8222-222222222222',
        company_id: '33333333-3333-4333-8333-333333333333',
      })
      .expect(400);

    expect(sophieFacade.generateAprDraft).not.toHaveBeenCalled();
  });

  it('rejeita company_id no rascunho assistido de PT', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/ai/generate-pt-draft')
      .send({
        site_id: '11111111-1111-4111-8111-111111111111',
        responsavel_id: '22222222-2222-4222-8222-222222222222',
        company_id: '33333333-3333-4333-8333-333333333333',
      })
      .expect(400);

    expect(sophieFacade.generatePtDraft).not.toHaveBeenCalled();
  });

  it('aceita rascunho assistido de APR sem company_id no body', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/ai/generate-apr-draft')
      .send({
        site_id: '11111111-1111-4111-8111-111111111111',
        elaborador_id: '22222222-2222-4222-8222-222222222222',
      })
      .expect(201);

    expect(sophieFacade.generateAprDraft).toHaveBeenCalledWith({
      site_id: '11111111-1111-4111-8111-111111111111',
      elaborador_id: '22222222-2222-4222-8222-222222222222',
    });
  });
});
