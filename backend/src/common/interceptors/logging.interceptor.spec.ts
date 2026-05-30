import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

type MockLogger = {
  log: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const getLogArgumentAt = <T>(mockFn: jest.Mock, index: number): T => {
  const [firstArg] = (mockFn.mock.calls[index] ?? []) as [T?];
  return firstArg as T;
};

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: MockLogger;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalHttpLogRequestBody = process.env.HTTP_LOG_REQUEST_BODY;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.HTTP_LOG_REQUEST_BODY = 'true';
    // Mock the Logger instance used inside the interceptor
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    interceptor = new LoggingInterceptor();
    Reflect.set(interceptor as object, 'logger', mockLogger);
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalHttpLogRequestBody === undefined) {
      delete process.env.HTTP_LOG_REQUEST_BODY;
    } else {
      process.env.HTTP_LOG_REQUEST_BODY = originalHttpLogRequestBody;
    }
  });

  it('should log request and response', (done) => {
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'GET',
          url: '/test',
          body: {},
          headers: {},
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('response data')),
    } as unknown as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockLogger.log).toHaveBeenCalledTimes(2);
        const requestPayload = getLogArgumentAt<Record<string, unknown>>(
          mockLogger.log,
          0,
        );
        const responsePayload = getLogArgumentAt<Record<string, unknown>>(
          mockLogger.log,
          1,
        );

        expect(requestPayload).toEqual(
          expect.objectContaining({
            type: 'REQUEST',
            method: 'GET',
            url: '/test',
          }),
        );
        expect(responsePayload).toEqual(
          expect.objectContaining({
            type: 'RESPONSE',
            method: 'GET',
            url: '/test',
          }),
        );
        done();
      },
    });
  });

  it('should not duplicate exception logs and should let the filter handle failures', (done) => {
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'GET',
          url: '/test',
          body: {},
          headers: {},
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({
          statusCode: 404,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(throwError(() => new Error('boom'))),
    } as unknown as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: () => {
        expect(mockLogger.log).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('sanitizes query string and body before logging', (done) => {
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'POST',
          url: '/public/validate?token=abc123&email=user@example.com',
          body: {
            cpf: '123.456.789-00',
            nested: { refresh_token: 'refresh-secret' },
          },
          headers: {},
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({
          statusCode: 201,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ ok: true })),
    } as unknown as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        const requestPayload = getLogArgumentAt<Record<string, unknown>>(
          mockLogger.log,
          0,
        );

        expect(requestPayload.url).toBe(
          '/public/validate?token=***REDACTED***&email=u***%40example.com',
        );
        expect(requestPayload.body).toEqual({
          cpf: '123.***.***-**',
          nested: { refresh_token: '***REDACTED***' },
        });
        done();
      },
    });
  });

  it('redacts signed token embedded in path before request logging', (done) => {
    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'GET',
          url: '/storage/download/eyJhbGciOiJIUzI1NiJ9.abc.def?trace=1',
          body: {},
          headers: {},
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({
          statusCode: 200,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('ok')),
    } as unknown as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        const requestPayload = getLogArgumentAt<Record<string, unknown>>(
          mockLogger.log,
          0,
        );

        expect(requestPayload.url).toBe(
          '/storage/download/***REDACTED***?trace=1',
        );
        done();
      },
    });
  });

  it('does not log request bodies in production even when opt-in is set', (done) => {
    process.env.NODE_ENV = 'production';

    const mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method: 'POST',
          url: '/cats',
          body: {
            descricao: 'Acidente com informacoes sensiveis do trabalhador',
            pessoas_envolvidas: ['Nome Completo'],
          },
          headers: {},
          ip: '127.0.0.1',
        }),
        getResponse: jest.fn().mockReturnValue({
          statusCode: 201,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ ok: true })),
    } as unknown as CallHandler;

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      next: () => {
        const requestPayload = getLogArgumentAt<Record<string, unknown>>(
          mockLogger.log,
          0,
        );

        expect(requestPayload).not.toHaveProperty('body');
        done();
      },
    });
  });
});
