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
      { get: () => undefined } as unknown as ConfigService,
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

  it('restringe a verificação JWT ao algoritmo HS256', () => {
    const { strategy } = buildStrategy();
    const verifyOptions = (strategy as unknown as { _verifOpts?: unknown })
      ._verifOpts as { algorithms?: string[] } | undefined;

    expect(verifyOptions?.algorithms).toEqual(['HS256']);
  });

  it('bloqueia token force_change fora do endpoint de troca de senha', async () => {
    const { strategy, authPrincipalService } = buildStrategy();

    await expect(
      strategy.validate({ path: '/aprs' } as never, {
        sub: 'user-1',
        jti: 'token-1',
        scope: 'force_change',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authPrincipalService.resolveAccessPrincipal).not.toHaveBeenCalled();
  });

  it('permite token force_change em /auth/change-password', async () => {
    const { strategy, authPrincipalService } = buildStrategy();
    authPrincipalService.resolveAccessPrincipal.mockResolvedValue({
      id: 'user-1',
    });

    const result = await strategy.validate(
      { path: '/auth/change-password' } as never,
      { sub: 'user-1', jti: 'token-1', scope: 'force_change' },
    );

    expect(result).toEqual({ id: 'user-1' });
    expect(authPrincipalService.resolveAccessPrincipal).toHaveBeenCalled();
  });

  it('fail-open quando isRevoked retorna false durante outage do Redis', async () => {
    // TokenRevocationService ja implementa o fail-open internamente.
    // Aqui validamos que JwtStrategy nao precisa de protecao adicional:
    // se isRevoked retorna false (comportamento de fail-open), validate prossegue.
    const { strategy, authPrincipalService } = buildStrategy();
    // isRevoked retorna false por padrao no mock — simula o comportamento fail-open
    authPrincipalService.resolveAccessPrincipal.mockResolvedValue({
      id: 'user-ok',
    });

    const result = await strategy.validate({} as never, {
      sub: 'user-ok',
      jti: 'jti-redis-down',
    });

    expect(result).toEqual({ id: 'user-ok' });
    expect(authPrincipalService.resolveAccessPrincipal).toHaveBeenCalled();
  });
});
