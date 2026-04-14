import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  SensitiveAction,
  SensitiveActionGuard,
} from '../../src/common/security/sensitive-action.guard';
import { SecurityAuditService } from '../../src/common/security/security-audit.service';
import { REDIS_CLIENT_AUTH } from '../../src/common/redis/redis.constants';

@Controller('phase4-test')
class Phase4TestController {
  @Get('export')
  @UseGuards(SensitiveActionGuard)
  @SensitiveAction('user_data_export')
  export() {
    return { ok: true };
  }
}

describe('E2E Fase 4 - step-up MFA', () => {
  let app: INestApplication;
  let redis: { eval: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };

  beforeAll(async () => {
    redis = { eval: jest.fn() };
    jwtService = { verifyAsync: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [Phase4TestController],
      providers: [
        SensitiveActionGuard,
        Reflector,
        {
          provide: REDIS_CLIENT_AUTH,
          useValue: redis,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_SECRET'
                ? 'test-jwt-secret-with-at-least-32-chars'
                : undefined,
            ),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: {
            stepUpFailed: jest.fn(),
            stepUpVerified: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req, _res, next) => {
      (req as Record<string, unknown>).user = {
        userId: 'user-1',
        jti: 'access-jti-1',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 403 quando step-up está ausente', async () => {
    const response = await request(app.getHttpServer()).get('/phase4-test/export');
    expect(response.status).toBe(403);
  });

  it('libera ação quando token é válido e single-use', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      purpose: 'step_up',
      reason: 'user_data_export',
      jti: 'stepup-jti-1',
    });
    redis.eval.mockResolvedValue(
      JSON.stringify({
        userId: 'user-1',
        reason: 'user_data_export',
        accessJti: 'access-jti-1',
        method: 'totp',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/phase4-test/export')
      .set('X-Step-Up-Token', 'signed-step-up-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
