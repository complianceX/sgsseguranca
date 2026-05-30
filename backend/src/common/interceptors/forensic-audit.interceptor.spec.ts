import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import {
  AppendForensicTrailEventInput,
  ForensicTrailService,
} from '../../forensic-trail/forensic-trail.service';
import { ForensicAuditInterceptor } from './forensic-audit.interceptor';

describe('ForensicAuditInterceptor', () => {
  it('sanitiza a rota antes de registrar a trilha forense', async () => {
    const append = jest.fn((_input: AppendForensicTrailEventInput) =>
      Promise.resolve(undefined),
    );
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce('create')
        .mockReturnValueOnce('dds'),
    } as unknown as Reflector;
    const interceptor = new ForensicAuditInterceptor(reflector, {
      append,
    } as unknown as ForensicTrailService);

    const request = {
      method: 'GET',
      originalUrl: '/public/dds/signature/token-secreto-123?token=abc&trace=1',
      params: {},
      headers: {},
      ip: '127.0.0.1',
      user: {
        userId: 'user-1',
        companyId: 'company-1',
      },
    };
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({ id: 'dds-1' }),
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        complete: () => resolve(),
        error: (error: unknown) =>
          reject(error instanceof Error ? error : new Error(String(error))),
      });
    });
    await new Promise<void>((resolve) => {
      setImmediate(() => resolve());
    });

    const [event] = append.mock.calls[0] || [];
    expect(event?.metadata?.route).toBe('/public/dds/signature/***REDACTED***');
  });
});
