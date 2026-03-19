import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { captureException } from '../monitoring/sentry';

jest.mock('../monitoring/sentry', () => ({
  captureException: jest.fn(),
}));

interface TestErrorResponsePayload {
  success: boolean;
  error: {
    message: string | string[];
    requestId?: string;
    path: string;
  };
}

interface TestLogPayload {
  type: string;
  statusCode: number;
  method: string;
  path: string;
  requestId?: string;
  responseTimeMs?: number;
  userId?: string;
  stack?: string;
}

const getFirstMockArg = <T>(mockFn: jest.Mock): T => {
  const firstCall = mockFn.mock.calls[0] as [T] | undefined;

  if (!firstCall) {
    throw new Error('Mock não foi chamado.');
  }

  return firstCall[0];
};

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: { warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };

    (filter as unknown as { logger: typeof mockLogger }).logger = mockLogger;
    jest.clearAllMocks();
  });

  it('registra 404 como warning estruturado sem stack', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const request = {
      url: '/inspections/123/pdf',
      method: 'GET',
      requestId: 'req-1',
      requestStartAt: Date.now() - 125,
      user: {
        userId: 'user-1',
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status, json }),
      }),
    } as ArgumentsHost;

    filter.catch(
      new NotFoundException(
        'Relatório de inspeção 123 não possui PDF final armazenado',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const jsonPayload = getFirstMockArg<TestErrorResponsePayload>(json);
    expect(jsonPayload.success).toBe(false);
    expect(jsonPayload.error.message).toBe(
      'Relatório de inspeção 123 não possui PDF final armazenado',
    );
    expect(jsonPayload.error.requestId).toBe('req-1');
    expect(jsonPayload.error.path).toBe('/inspections/123/pdf');
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);

    const logPayload = getFirstMockArg<TestLogPayload>(mockLogger.warn);
    expect(logPayload.type).toBe('HTTP_EXCEPTION');
    expect(logPayload.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(logPayload.method).toBe('GET');
    expect(logPayload.path).toBe('/inspections/123/pdf');
    expect(logPayload.requestId).toBe('req-1');
    expect(typeof logPayload.responseTimeMs).toBe('number');
    expect(logPayload.userId).toBe('user-1');
    expect(logPayload.stack).toBeUndefined();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('registra 500 como error estruturado e envia para monitoring', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const request = {
      url: '/inspections/123/pdf',
      method: 'GET',
      requestId: 'req-2',
      requestStartAt: Date.now() - 80,
      user: {
        id: 'user-2',
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status, json }),
      }),
    } as ArgumentsHost;

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);

    const logPayload = getFirstMockArg<TestLogPayload>(mockLogger.error);
    expect(logPayload.type).toBe('HTTP_EXCEPTION');
    expect(logPayload.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(logPayload.method).toBe('GET');
    expect(logPayload.path).toBe('/inspections/123/pdf');
    expect(logPayload.requestId).toBe('req-2');
    expect(typeof logPayload.responseTimeMs).toBe('number');
    expect(logPayload.userId).toBe('user-2');
    expect(logPayload.stack).toContain('Error: boom');
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
