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
  const createContext = () => {
    const request = {
      path: '/health/public',
      url: '/health/public',
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
  });

  it('deve lançar 429 e nunca retornar o Response bruto quando bloqueado', async () => {
    const throttlerService = {
      checkLimit: jest
        .fn()
        .mockResolvedValue({ isBlocked: true, remainingTime: 12_000 }),
    };
    const interceptor = new ResilientThrottlerInterceptor(
      throttlerService as never,
    );
    const { context, response } = createContext();
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
});
