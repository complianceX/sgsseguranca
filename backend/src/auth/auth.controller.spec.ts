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
  let authService: Pick<
    AuthService,
    | 'refresh'
    | 'validateUser'
    | 'login'
    | 'logout'
    | 'verifyUserPassword'
  >;
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
      verifyUserPassword: jest.fn(),
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
        findAuthSessionUser: jest.fn().mockResolvedValue({
          id: 'user-1',
          nome: 'Usuário Teste',
          cpf: '12345678900',
          email: 'user@example.com',
          company_id: 'company-1',
          profile: { id: 'profile-1', nome: 'Administrador Geral' },
          profile_id: 'profile-1',
          status: true,
          created_at: new Date('2026-03-28T00:00:00.000Z'),
          updated_at: new Date('2026-03-28T00:00:00.000Z'),
        }),
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
    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

    const result = await controller.refresh(req, res);

    expect(result).toEqual({ accessToken: 'new-access' });
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_csrf',
      expect.objectContaining({ path: '/auth/refresh' }),
    );
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

  it('login limpa cookie CSRF legado e emite o novo cookie amplo para o frontend', async () => {
    (turnstileService.assertHuman as jest.Mock).mockResolvedValue(undefined);
    (authService.validateUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      company_id: 'company-1',
    });
    (authService.login as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      user: { id: 'user-1' },
    });

    const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

    await controller.login(
      {
        headers: { 'user-agent': 'jest' },
      } as any,
      {
        cpf: '12345678900',
        password: 'SenhaSegura@123',
        turnstileToken: 'turnstile',
      } as any,
      res,
    );

    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_csrf',
      expect.objectContaining({ path: '/auth/refresh' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_csrf',
      expect.any(String),
      expect.objectContaining({ path: '/' }),
    );
  });

  it('login continua funcionando quando a auth legada está desligada, desde que validateUser aprove', async () => {
    (turnstileService.assertHuman as jest.Mock).mockResolvedValue(undefined);
    (authService.validateUser as jest.Mock).mockResolvedValue({
      id: 'user-1',
      company_id: 'company-1',
    });
    (authService.login as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      user: { id: 'user-1' },
    });

    const result = await controller.login(
      {
        headers: { 'user-agent': 'jest' },
      } as any,
      {
        cpf: '12345678900',
        password: 'SenhaSegura@123',
        turnstileToken: 'turnstile',
      } as any,
      { cookie: jest.fn(), clearCookie: jest.fn() } as any,
    );

    expect(turnstileService.assertHuman).toHaveBeenCalled();
    expect(authService.validateUser).toHaveBeenCalledWith(
      '12345678900',
      'SenhaSegura@123',
    );
    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'new-access',
        user: { id: 'user-1' },
      }),
    );
  });

  it('confirm-password usa verifyUserPassword e continua funcionando após desligar auth legada', async () => {
    (authService.verifyUserPassword as jest.Mock).mockResolvedValue(true);

    const result = await controller.confirmPassword(
      {
        user: {
          userId: 'user-1',
        },
      } as any,
      {
        password: 'SenhaSegura@123',
      } as any,
    );

    expect(authService.verifyUserPassword).toHaveBeenCalledWith(
      'user-1',
      'SenhaSegura@123',
    );
    expect(result).toEqual(
      expect.objectContaining({
        stepUpToken: expect.any(String),
        expiresIn: 600,
      }),
    );
  });

  it('confirm-password retorna 401 quando verifyUserPassword reprova', async () => {
    (authService.verifyUserPassword as jest.Mock).mockResolvedValue(false);

    await expect(
      controller.confirmPassword(
        {
          user: {
            userId: 'user-1',
          },
        } as any,
        {
          password: 'SenhaErrada@123',
        } as any,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('me usa leitura leve de sessão e retorna RBAC', async () => {
    const req = {
      user: {
        userId: 'user-1',
      },
    } as any;

    const result = await controller.me(req);

    expect(result).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-1' }),
        roles: ['admin'],
        permissions: ['can_view'],
      }),
    );
  });
});
