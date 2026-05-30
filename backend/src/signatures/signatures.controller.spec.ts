/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

describe('SignaturesController (http)', () => {
  let app: INestApplication;
  const DOCUMENT_ID = '550e8400-e29b-41d4-a716-446655440000';

  const signaturesService = {
    create: jest.fn(),
    findByDocument: jest.fn(),
    verifyById: jest.fn(),
    remove: jest.fn(),
    removeByDocument: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    signaturesService.create.mockResolvedValue({ id: 'signature-1' });
    signaturesService.findByDocument.mockResolvedValue([]);
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SignaturesController],
      providers: [{ provide: SignaturesService, useValue: signaturesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => { user?: unknown } };
        }) => {
          context.switchToHttp().getRequest().user = {
            userId: 'user-1',
            profile: { nome: 'TST' },
          };
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
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
    if (app) {
      await app.close();
    }
  });

  it('rejeita company_id forjado ao criar assinatura', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/signatures')
      .send({
        document_id: DOCUMENT_ID,
        document_type: 'APR',
        signature_data: 'data:image/png;base64,AAAA',
        type: 'digital',
        company_id: 'tenant-forjado',
      })
      .expect(400);

    expect(signaturesService.create).not.toHaveBeenCalled();
  });

  it('cria assinatura valida sem aceitar tenant no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/signatures')
      .send({
        document_id: DOCUMENT_ID,
        document_type: 'APR',
        signature_data: 'data:image/png;base64,AAAA',
        type: 'digital',
      })
      .expect(201);

    expect(signaturesService.create).toHaveBeenCalledWith(
      {
        document_id: DOCUMENT_ID,
        document_type: 'APR',
        signature_data: 'data:image/png;base64,AAAA',
        type: 'digital',
      },
      'user-1',
    );
    expect(
      signaturesService.create.mock.calls[0][0].company_id,
    ).toBeUndefined();
  });

  it('rejeita company_id forjado na consulta de assinaturas', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(
        `/signatures?document_id=${DOCUMENT_ID}&document_type=APR&company_id=tenant-forjado`,
      )
      .expect(400);

    expect(signaturesService.findByDocument).not.toHaveBeenCalled();
  });

  it('encaminha consulta valida com document_id e document_type tipados', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(`/signatures?document_id=${DOCUMENT_ID}&document_type=APR`)
      .expect(200);

    expect(signaturesService.findByDocument).toHaveBeenCalledWith(
      DOCUMENT_ID,
      'APR',
    );
  });

  it('bloqueia delete por documento com UUID inválido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .delete('/signatures/document/not-a-uuid?document_type=APR')
      .expect(400);

    expect(signaturesService.removeByDocument).not.toHaveBeenCalled();
  });

  it('bloqueia delete por documento com campo extra inesperado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .delete(
        `/signatures/document/${DOCUMENT_ID}?document_type=APR&forged=true`,
      )
      .expect(400);

    expect(signaturesService.removeByDocument).not.toHaveBeenCalled();
  });
});
