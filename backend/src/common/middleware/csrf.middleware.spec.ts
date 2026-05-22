import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CsrfMiddleware, isCsrfExemptPath } from './csrf.middleware';

function makeRequest(input: {
  method: string;
  path: string;
  csrfCookie?: string;
  csrfHeader?: string;
}): Request {
  const request = {
    method: input.method,
    path: input.path,
    originalUrl: input.path,
    url: input.path,
    headers: input.csrfHeader ? { 'x-csrf-token': input.csrfHeader } : {},
  } as Partial<Request>;

  Reflect.set(
    request,
    'cookies',
    input.csrfCookie ? { 'csrf-token': input.csrfCookie } : {},
  );

  return request as Request;
}

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    middleware = new CsrfMiddleware();
    next = jest.fn();
  });

  it('mantem rotas mutaveis autenticadas protegidas por CSRF', () => {
    expect(() =>
      middleware.use(
        makeRequest({ method: 'POST', path: '/tenant-lifecycle/invites' }),
        {} as Response,
        next,
      ),
    ).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite rota mutavel autenticada quando cookie e header CSRF coincidem', () => {
    middleware.use(
      makeRequest({
        method: 'POST',
        path: '/dds/dds-1/signature-invites',
        csrfCookie: 'csrf-1',
        csrfHeader: 'csrf-1',
      }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/public/dds/signature/token-1',
    '/tenant-lifecycle/onboarding/token-1/complete',
    '/v1/public/dds/signature/token-1',
    '/v1/tenant-lifecycle/onboarding/token-1/complete',
  ])('permite POST publico por link sem cookie CSRF: %s', (path) => {
    middleware.use(makeRequest({ method: 'POST', path }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reconhece paths publicos mesmo com query string', () => {
    expect(isCsrfExemptPath('/public/dds/signature/token-1?x=1')).toBe(true);
    expect(isCsrfExemptPath('/v1/public/dds/signature/token-1?x=1')).toBe(true);
    expect(isCsrfExemptPath('/tenant-lifecycle/invites')).toBe(false);
    expect(isCsrfExemptPath('/public/signature/verify')).toBe(false);
  });
});
