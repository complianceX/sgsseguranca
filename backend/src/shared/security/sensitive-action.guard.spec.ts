import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { SensitiveActionGuard } from './sensitive-action.guard';
import { SecurityAuditService } from './security-audit.service';

function createExecutionContext(request: Record<string, unknown>) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

describe('SensitiveActionGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue('user_data_export'),
  } as unknown as Reflector;
  const redis = {
    eval: jest.fn(),
  };
  const securityAudit = {
    stepUpFailed: jest.fn(),
    stepUpVerified: jest.fn(),
  } as unknown as SecurityAuditService;
  const jwtService = {
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'JWT_SECRET'
        ? 'test-jwt-secret-with-at-least-32-chars'
        : undefined,
    ),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia requisição sem token de step-up', async () => {
    const guard = new SensitiveActionGuard(
      reflector,
      redis as never,
      securityAudit,
      jwtService,
      configService,
    );

    await expect(
      guard.canActivate(
        createExecutionContext({
          user: { userId: 'user-1', jti: 'access-jti-1' },
          headers: {},
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aceita token válido, single-use e preso ao jti da sessão', async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
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

    const guard = new SensitiveActionGuard(
      reflector,
      redis as never,
      securityAudit,
      jwtService,
      configService,
    );

    await expect(
      guard.canActivate(
        createExecutionContext({
          user: { userId: 'user-1', jti: 'access-jti-1' },
          headers: { 'x-step-up-token': 'signed-step-up-token' },
        }),
      ),
    ).resolves.toBe(true);

    const mockedSecurityAudit = securityAudit as unknown as {
      stepUpVerified: jest.Mock;
    };
    const stepUpVerifiedMock = mockedSecurityAudit.stepUpVerified;
    expect(stepUpVerifiedMock).toHaveBeenCalledWith(
      'user-1',
      'user_data_export',
      'totp',
    );
  });
});
