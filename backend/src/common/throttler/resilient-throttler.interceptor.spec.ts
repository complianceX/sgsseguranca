import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { ResilientThrottlerInterceptor } from './resilient-throttler.interceptor';

describe('ResilientThrottlerInterceptor', () => {
  const createContext = (path = '/health/public') => {
    const request = {
      path,
      url: path,
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
    };
    const response = {
      setHeader: jest.fn(),
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;

    return { context, request, response };
  };

  it('deve propagar o fluxo normalmente quando a requisição não está bloqueada', async () => {
    const throttlerService = {
      shouldThrottle: jest.fn().mockReturnValue(false),
      checkLimit: jest.fn().mockResolvedValue({ isBlocked: false }),
    };
    const interceptor = new ResilientThrottlerInterceptor(
      throttlerService as never,
    );
    const { context } = createContext();
    const next: CallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    const result$ = await interceptor.intercept(context, next);

    await expect(lastValueFrom(result$)).resolves.toEqual({ status: 'ok' });
    expect(throttlerService.checkLimit).not.toHaveBeenCalled();
  });

  it('deve lançar 429 e nunca retornar o Response bruto quando bloqueado', async () => {
    const throttlerService = {
      shouldThrottle: jest.fn().mockReturnValue(true),
      checkLimit: jest
        .fn()
        .mockResolvedValue({ isBlocked: true, remainingTime: 12_000 }),
    };
    const interceptor = new ResilientThrottlerInterceptor(
      throttlerService as never,
    );
    const { context, response } = createContext('/dashboard/summary');
    const nextHandle = jest.fn(() => of({ status: 'should-not-run' }));
    const next: CallHandler = {
      handle: nextHandle,
    };

    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(
      HttpException,
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      '0',
    );
    expect(nextHandle).not.toHaveBeenCalled();
    await interceptor.intercept(context, next).catch((error: HttpException) => {
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  it('usa authPrincipal do middleware para identificar usuário antes do req.user', async () => {
    const throttlerService = {
      shouldThrottle: jest.fn().mockReturnValue(true),
      checkLimit: jest.fn().mockResolvedValue({ isBlocked: false }),
    };
    const interceptor = new ResilientThrottlerInterceptor(
      throttlerService as never,
    );
    const { context, request } = createContext('/dashboard/summary');
    request.authPrincipal = { userId: 'user-1', id: 'user-1' };
    const next: CallHandler = {
      handle: () => of({ status: 'ok' }),
    };

    const result$ = await interceptor.intercept(context, next);

    await expect(lastValueFrom(result$)).resolves.toEqual({ status: 'ok' });
    expect(throttlerService.checkLimit).toHaveBeenCalledWith(
      request,
      'user:user-1',
    );
  });
});
