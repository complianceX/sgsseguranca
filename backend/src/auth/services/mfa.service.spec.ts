import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { MfaService } from './mfa.service';
import { UserMfaCredential } from '../entities/user-mfa-credential.entity';
import { UserMfaRecoveryCode } from '../entities/user-mfa-recovery-code.entity';
import { PasswordService } from '../../common/services/password.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { AuthRedisService } from '../../common/redis/redis.service';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';
import { Role } from '../enums/roles.enum';

function createService(configOverrides: Record<string, string> = {}) {
  const credentialRepository = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<UserMfaCredential>>;
  const recoveryCodeRepository = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<Repository<UserMfaRecoveryCode>>;
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-step-up-token'),
  } as unknown as jest.Mocked<JwtService>;
  const config: Record<string, string> = {
    MFA_ENABLED: 'true',
    JWT_SECRET: 'test-jwt-secret-with-at-least-32-chars',
    ...configOverrides,
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as jest.Mocked<ConfigService>;
  const passwordService = {
    verify: jest.fn(),
    hash: jest.fn(),
  } as unknown as jest.Mocked<PasswordService>;
  const securityAudit = {
    stepUpFailed: jest.fn(),
    stepUpIssued: jest.fn(),
    mfaVerificationFailed: jest.fn(),
    mfaRecoveryCodeUsed: jest.fn(),
  } as unknown as jest.Mocked<SecurityAuditService>;
  const redisClient = {
    setex: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  const redisService = {
    getClient: jest.fn(() => redisClient),
  } as unknown as jest.Mocked<AuthRedisService>;
  const usersService = {} as UsersService;
  const authService = {
    verifyUserPassword: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AuthService>;

  const service = new MfaService(
    credentialRepository,
    recoveryCodeRepository,
    jwtService,
    configService,
    passwordService,
    securityAudit,
    redisService,
    usersService,
    authService,
  );

  return {
    service,
    credentialRepository,
    recoveryCodeRepository,
    jwtService,
    configService,
    securityAudit,
    redisClient,
    authService,
  };
}

describe('MfaService', () => {
  it('bloqueia ADMIN_GERAL sem MFA ativo para operações step-up', async () => {
    const { service, securityAudit } = createService();

    await expect(
      service.verifyStepUp({
        userId: 'user-1',
        profileName: Role.ADMIN_GERAL,
        reason: 'admin_gdpr_delete_user',
        password: 'Senha@123',
        accessJti: 'access-jti-1',
      }),
    ).rejects.toThrow(ForbiddenException);

    const mockedSecurityAudit = securityAudit as unknown as {
      stepUpFailed: jest.Mock;
    };
    const stepUpFailedMock = mockedSecurityAudit.stepUpFailed;
    expect(stepUpFailedMock).toHaveBeenCalledWith('user-1', 'mfa_required');
  });

  it('permite fallback por senha para ADMIN_EMPRESA antes do enforcement final', async () => {
    const { service, authService, jwtService, redisClient, securityAudit } =
      createService({
        ADMIN_EMPRESA_STEP_UP_PASSWORD_FALLBACK_ENABLED: 'true',
      });

    const result = await service.verifyStepUp({
      userId: 'user-2',
      profileName: Role.ADMIN_EMPRESA,
      reason: 'user_role_change',
      password: 'Senha@123',
      accessJti: 'access-jti-2',
    });

    const mockedAuthService = authService as unknown as {
      verifyUserPassword: jest.Mock;
    };
    const mockedJwtService = jwtService as unknown as { signAsync: jest.Mock };
    const mockedRedisClient = redisClient as { setex: jest.Mock };
    const mockedSecurityAudit = securityAudit as unknown as {
      stepUpIssued: jest.Mock;
    };
    const verifyUserPasswordMock = mockedAuthService.verifyUserPassword;
    const signAsyncMock = mockedJwtService.signAsync;
    const setexMock = mockedRedisClient.setex;
    const stepUpIssuedMock = mockedSecurityAudit.stepUpIssued;
    expect(verifyUserPasswordMock).toHaveBeenCalledWith('user-2', 'Senha@123');
    expect(signAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-2',
        purpose: 'step_up',
        reason: 'user_role_change',
        accessJti: 'access-jti-2',
        method: 'password_fallback',
      }),
      expect.objectContaining({
        secret: 'test-jwt-secret-with-at-least-32-chars',
      }),
    );
    expect(setexMock).toHaveBeenCalledWith(
      expect.stringMatching(/^mfa:step-up:/),
      expect.any(Number),
      expect.stringContaining('"reason":"user_role_change"'),
    );
    expect(result).toEqual({
      stepUpToken: 'signed-step-up-token',
      expiresIn: 300,
    });
    expect(stepUpIssuedMock).toHaveBeenCalledWith(
      'user-2',
      'user_role_change',
      'password_fallback',
    );
  });

  it('bloqueia fallback por senha de ADMIN_EMPRESA após a data de enforcement', async () => {
    const { service, securityAudit } = createService({
      ADMIN_EMPRESA_MFA_ENFORCEMENT_DATE: '2025-01-01T00:00:00.000Z',
      ADMIN_EMPRESA_STEP_UP_PASSWORD_FALLBACK_ENABLED: 'true',
    });

    await expect(
      service.verifyStepUp({
        userId: 'user-3',
        profileName: Role.ADMIN_EMPRESA,
        reason: 'admin_cleanup_expired',
        password: 'Senha@123',
        accessJti: 'access-jti-3',
      }),
    ).rejects.toThrow(ForbiddenException);

    const mockedSecurityAudit = securityAudit as unknown as {
      stepUpFailed: jest.Mock;
    };
    const stepUpFailedMock = mockedSecurityAudit.stepUpFailed;
    expect(stepUpFailedMock).toHaveBeenCalledWith('user-3', 'mfa_required');
  });
});
