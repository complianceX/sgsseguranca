import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PublicSignaturesController } from './public-signatures.controller';
import { SignaturesService } from './signatures.service';

describe('PublicSignaturesController (http)', () => {
  let app: INestApplication;
  const signaturesService = {
    verifyByHashPublic: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicSignaturesController],
      providers: [{ provide: SignaturesService, useValue: signaturesService }],
    }).compile();

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

  beforeEach(() => {
    jest.clearAllMocks();
    signaturesService.verifyByHashPublic.mockResolvedValue({
      valid: true,
      message: 'ok',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejeita hash inválido (não hexadecimal)', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/public/signature/verify')
      .query({ hash: 'zzzz' })
      .expect(400);

    expect(signaturesService.verifyByHashPublic).not.toHaveBeenCalled();
  });

  it('rejeita payload gigante no query hash', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/public/signature/verify')
      .query({ hash: 'a'.repeat(10000) })
      .expect(400);

    expect(signaturesService.verifyByHashPublic).not.toHaveBeenCalled();
  });

  it('rejeita campo extra inesperado no query', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/public/signature/verify')
      .query({ hash: 'a'.repeat(64), extra: '1' })
      .expect(400);

    expect(signaturesService.verifyByHashPublic).not.toHaveBeenCalled();
  });
});
