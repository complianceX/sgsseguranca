import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getUserRateLimitRoute,
  UserRateLimitGuard,
} from './user-rate-limit.guard';
import { UserRateLimitService } from '../rate-limit/user-rate-limit.service';

type MockResponse = {
  setHeader: jest.Mock;
};

function createExecutionContext(
  request: Record<string, unknown>,
  response: MockResponse,
): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('UserRateLimitGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compõe a rota com baseUrl + route.path para evitar colisões entre controllers', () => {
    expect(
      getUserRateLimitRoute({
        method: 'GET',
        path: '/users/me/export',
        baseUrl: '/users',
        route: { path: '/me/export' },
      } as never),
    ).toBe('GET:/users/me/export');
  });

  it('retorna 429 com mensagem genérica e headers informativos', async () => {
    const checkLimit = jest.fn().mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: 61_000,
      retryAfter: 11,
    });

    const guard = new UserRateLimitGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue({
          requestsPerMinute: 3,
        }),
      } as unknown as Reflector,
      {
        checkLimit,
      } as unknown as UserRateLimitService,
    );

    const response = { setHeader: jest.fn() };
    const context = createExecutionContext(
      {
        user: { sub: 'user-1' },
        method: 'GET',
        path: '/users/me/export',
        baseUrl: '/users',
        route: { path: '/me/export' },
      },
      response,
    );

    let thrown: HttpException | undefined;
    try {
      await guard.canActivate(context);
    } catch (error) {
      thrown = error as HttpException;
    }

    expect(checkLimit).toHaveBeenCalledWith(
      'user-1',
      'GET:/users/me/export',
      3,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-User-RateLimit-Limit',
      '3',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-User-RateLimit-Remaining',
      '0',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '11');
    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown?.getResponse()).toEqual({
      statusCode: 429,
      message:
        'Limite de 3 requisições/minuto por usuário excedido. Aguarde 11s antes de tentar novamente.',
      retryAfter: 11,
    });
  });

  it('usa authPrincipal propagado pelo middleware quando req.user ainda nao existe', async () => {
    const checkLimit = jest.fn().mockResolvedValue({
      allowed: true,
      remaining: 2,
      resetAt: 61_000,
    });

    const guard = new UserRateLimitGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue({
          requestsPerMinute: 3,
        }),
      } as unknown as Reflector,
      {
        checkLimit,
      } as unknown as UserRateLimitService,
    );

    const response = { setHeader: jest.fn() };
    const context = createExecutionContext(
      {
        authPrincipal: {
          userId: 'user-from-middleware',
          id: 'user-from-middleware',
        },
        method: 'POST',
        path: '/reports/generate',
        baseUrl: '/reports',
        route: { path: '/generate' },
      },
      response,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledWith(
      'user-from-middleware',
      'POST:/reports/generate',
      3,
    );
  });
});
