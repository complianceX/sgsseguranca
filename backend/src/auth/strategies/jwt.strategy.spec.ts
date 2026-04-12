import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const buildStrategy = () => {
    const tokenRevocationService = {
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    const authPrincipalService = {
      resolveAccessPrincipal: jest.fn(),
    };
    const strategy = new JwtStrategy(
      {} as ConfigService,
      tokenRevocationService as never,
      authPrincipalService as never,
    );

    return { strategy, tokenRevocationService, authPrincipalService };
  };

  it('reutiliza authPrincipal já resolvido no request quando o subject coincide', async () => {
    const { strategy, authPrincipalService } = buildStrategy();
    const principal = {
      id: 'user-1',
      userId: 'user-1',
      sub: 'user-1',
      app_user_id: 'user-1',
      company_id: 'company-1',
      companyId: 'company-1',
      isSuperAdmin: false,
      tokenSource: 'local' as const,
    };

    const result = await strategy.validate(
      { authPrincipal: principal } as never,
      { sub: 'user-1', jti: 'token-1' },
    );

    expect(result).toBe(principal);
    expect(authPrincipalService.resolveAccessPrincipal).not.toHaveBeenCalled();
  });

  it('resolve novamente o principal quando não há cache compatível no request', async () => {
    const { strategy, authPrincipalService } = buildStrategy();
    authPrincipalService.resolveAccessPrincipal.mockResolvedValue({
      id: 'user-2',
    });

    const result = await strategy.validate(
      {
        authPrincipal: {
          id: 'user-1',
          userId: 'user-1',
          sub: 'user-1',
          app_user_id: 'user-1',
          isSuperAdmin: false,
          tokenSource: 'local' as const,
        },
      } as never,
      { sub: 'auth-user-2', jti: 'token-2' },
    );

    expect(authPrincipalService.resolveAccessPrincipal).toHaveBeenCalledWith({
      sub: 'auth-user-2',
      jti: 'token-2',
    });
    expect(result).toEqual({ id: 'user-2' });
  });

  it('bloqueia token revogado antes de reaproveitar o cache do request', async () => {
    const { strategy, tokenRevocationService, authPrincipalService } =
      buildStrategy();
    tokenRevocationService.isRevoked.mockResolvedValue(true);

    await expect(
      strategy.validate(
        {
          authPrincipal: {
            id: 'user-1',
            userId: 'user-1',
            sub: 'user-1',
            app_user_id: 'user-1',
            isSuperAdmin: false,
            tokenSource: 'local' as const,
          },
        } as never,
        { sub: 'user-1', jti: 'revoked-token' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authPrincipalService.resolveAccessPrincipal).not.toHaveBeenCalled();
  });
});
