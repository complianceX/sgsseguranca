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

  beforeEach(() => {
    // Mock the Logger instance used inside the interceptor
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    interceptor = new LoggingInterceptor();
    // Inject the mock logger into the private property
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (interceptor as any).logger = mockLogger;
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
});
