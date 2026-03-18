import {
  ArgumentsHost,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { captureException } from '../monitoring/sentry';

jest.mock('../monitoring/sentry', () => ({
  captureException: jest.fn(),
}));

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: { warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockLogger = {
      warn: jest.fn(),
      error: jest.fn(),
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (filter as any).logger = mockLogger;
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
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          message: 'Relatório de inspeção 123 não possui PDF final armazenado',
          requestId: 'req-1',
          path: '/inspections/123/pdf',
        }),
      }),
    );
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);

    const logPayload = JSON.parse(mockLogger.warn.mock.calls[0][0]);
    expect(logPayload).toEqual(
      expect.objectContaining({
        type: 'HTTP_EXCEPTION',
        method: 'GET',
        path: '/inspections/123/pdf',
        requestId: 'req-1',
        responseTime: expect.stringMatching(/ms$/),
        userId: 'user-1',
      }),
    );
    expect(logPayload).not.toHaveProperty('stack');
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

    expect(status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockLogger.error).toHaveBeenCalledTimes(1);

    const logPayload = JSON.parse(mockLogger.error.mock.calls[0][0]);
    expect(logPayload).toEqual(
      expect.objectContaining({
        type: 'HTTP_EXCEPTION',
        method: 'GET',
        path: '/inspections/123/pdf',
        requestId: 'req-2',
        responseTime: expect.stringMatching(/ms$/),
        userId: 'user-2',
      }),
    );
    expect(logPayload.stack).toContain('Error: boom');
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
