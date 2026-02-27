import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: { log: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    // Mock the Logger instance used inside the interceptor
    mockLogger = {
      log: jest.fn(),
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
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'REQUEST' }),
        );
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'RESPONSE' }),
        );
        done();
      },
    });
  });
});
