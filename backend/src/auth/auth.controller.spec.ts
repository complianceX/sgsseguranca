import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { UsersService } from '../users/users.service';
import type { BruteForceService } from './brute-force.service';
import type { RbacService } from '../rbac/rbac.service';
import type { SecurityAuditService } from '../common/security/security-audit.service';
import type { TurnstileService } from './turnstile.service';
import type { Redis } from 'ioredis';
import type { ConfigService } from '@nestjs/config';

describe('AuthController security hardening', () => {
  let controller: AuthController;
  let authService: Pick<AuthService, 'refresh' | 'validateUser' | 'login' | 'logout'>;
  let bruteForceService: Pick<
    BruteForceService,
    | 'assertAllowed'
    | 'assertCpfAllowed'
    | 'registerFailure'
    | 'registerCpfFailure'
    | 'reset'
    | 'resetCpf'
  >;
  let turnstileService: Pick<TurnstileService, 'assertHuman'>;
  let rbacService: Pick<RbacService, 'getUserAccess'>;

  beforeEach(() => {
    process.env.REFRESH_CSRF_ENFORCED = 'true';
    process.env.REFRESH_CSRF_REPORT_ONLY = 'false';

    authService = {
      refresh: jest.fn(),
      validateUser: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
    };
    bruteForceService = {
      assertAllowed: jest.fn(),
      assertCpfAllowed: jest.fn(),
      registerFailure: jest.fn(),
      registerCpfFailure: jest.fn(),
      reset: jest.fn(),
      resetCpf: jest.fn(),
    };
    turnstileService = {
      assertHuman: jest.fn(),
    };
    rbacService = {
      getUserAccess: jest.fn().mockResolvedValue({
        roles: ['admin'],
        permissions: ['can_view'],
      }),
    };

    controller = new AuthController(
      authService as AuthService,
      {
        findOne: jest.fn(),
        findOneWithPassword: jest.fn(),
        hasSignaturePin: jest.fn(),
        setSignaturePin: jest.fn(),
      } as unknown as UsersService,
      bruteForceService as BruteForceService,
      rbacService as RbacService,
      {
        loginSuccess: jest.fn(),
        stepUpFailed: jest.fn(),
        stepUpIssued: jest.fn(),
      } as unknown as SecurityAuditService,
      turnstileService as TurnstileService,
      { setex: jest.fn() } as unknown as Redis,
      {
        get: jest.fn((key: string) =>
          key === 'CORS_ALLOWED_ORIGINS'
            ? 'https://app.example.com'
            : undefined,
        ),
      } as unknown as ConfigService,
    );
  });

  it('refresh exige CSRF válido quando enforcement está ativo', async () => {
    const req = {
      cookies: {
        refresh_token: 'refresh-token',
        refresh_csrf: 'cookie-token',
      },
      headers: {
        origin: 'https://app.example.com',
        'x-refresh-csrf': 'header-token-different',
        'user-agent': 'jest',
      },
      originalUrl: '/auth/refresh',
      url: '/auth/refresh',
    } as any;
    const res = { cookie: jest.fn() } as any;

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh rejeita origem não permitida', async () => {
    const req = {
      cookies: {
        refresh_token: 'refresh-token',
        refresh_csrf: 'token',
      },
      headers: {
        origin: 'https://evil.example.com',
        'x-refresh-csrf': 'token',
      },
      originalUrl: '/auth/refresh',
      url: '/auth/refresh',
    } as any;
    const res = { cookie: jest.fn() } as any;

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh rejeita origem com prefix spoofing', async () => {
    const req = {
      cookies: {
        refresh_token: 'refresh-token',
        refresh_csrf: 'token',
      },
      headers: {
        origin: 'https://app.example.com.evil.com/path',
        'x-refresh-csrf': 'token',
      },
      originalUrl: '/auth/refresh',
      url: '/auth/refresh',
    } as any;
    const res = { cookie: jest.fn() } as any;

    await expect(controller.refresh(req, res)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refresh rotaciona refresh token e cookie CSRF quando request é legítima', async () => {
    (authService.refresh as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    const req = {
      cookies: {
        refresh_token: 'refresh-token',
        refresh_csrf: 'csrf-token',
      },
      headers: {
        origin: 'https://app.example.com',
        'x-refresh-csrf': 'csrf-token',
        'user-agent': 'jest',
      },
      originalUrl: '/auth/refresh',
      url: '/auth/refresh',
    } as any;
    const res = { cookie: jest.fn() } as any;

    const result = await controller.refresh(req, res);

    expect(result).toEqual({ accessToken: 'new-access' });
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-refresh',
      expect.any(Object),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_csrf',
      expect.any(String),
      expect.any(Object),
    );
  });
});
