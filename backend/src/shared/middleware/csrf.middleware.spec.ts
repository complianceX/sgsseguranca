import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { CsrfMiddleware, isCsrfExemptPath } from './csrf.middleware';

function makeRequest(input: {
  method: string;
  path: string;
  reqPath?: string;
  originalUrl?: string;
  url?: string;
  csrfCookie?: string;
  csrfHeader?: string;
}): Request {
  const request = {
    method: input.method,
    path: input.reqPath ?? input.path,
    originalUrl: input.originalUrl ?? input.path,
    url: input.url ?? input.path,
    headers: input.csrfHeader ? { 'x-csrf-token': input.csrfHeader } : {},
  } as Partial<Request>;

  Reflect.set(
    request,
    'cookies',
    input.csrfCookie ? { 'csrf-token': input.csrfCookie } : {},
  );

  return request as Request;
}

function makeConfigService(secret?: string): ConfigService {
  return {
    get: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
}

const TEST_SECRET = 'csrf-test-secret-do-not-use-in-production-000000000000';

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    middleware = new CsrfMiddleware(makeConfigService());
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

  it('permite rota mutavel autenticada no modo fallback (sem secret) quando cookie e header coincidem', () => {
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

  it('usa originalUrl quando req.path chega como root no middleware', () => {
    middleware.use(
      makeRequest({
        method: 'POST',
        path: '/public/dds/signature/token-1',
        reqPath: '/',
      }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reconhece paths publicos mesmo com query string', () => {
    expect(isCsrfExemptPath('/public/dds/signature/token-1?x=1')).toBe(true);
    expect(isCsrfExemptPath('/v1/public/dds/signature/token-1?x=1')).toBe(true);
    expect(
      isCsrfExemptPath('/tenant-lifecycle/onboarding/token-1/validate'),
    ).toBe(false);
    expect(
      isCsrfExemptPath('/v1/tenant-lifecycle/onboarding/token-1/validate'),
    ).toBe(false);
    expect(isCsrfExemptPath('/tenant-lifecycle/invites')).toBe(false);
    expect(isCsrfExemptPath('/public/signature/verify')).toBe(false);
  });
});

describe('CsrfMiddleware — modo HMAC', () => {
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    next = jest.fn();
  });

  it('aceita request quando header é HMAC(secret, cookieToken) correto', () => {
    const mw = new CsrfMiddleware(makeConfigService(TEST_SECRET));
    const rawToken =
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const signed = hmac(TEST_SECRET, rawToken);

    mw.use(
      makeRequest({
        method: 'POST',
        path: '/dds/dds-1/signature-invites',
        csrfCookie: rawToken,
        csrfHeader: signed,
      }),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejeita request quando header é o rawToken em vez do HMAC', () => {
    const mw = new CsrfMiddleware(makeConfigService(TEST_SECRET));
    const rawToken =
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    expect(() =>
      mw.use(
        makeRequest({
          method: 'POST',
          path: '/dds/dds-1/signature-invites',
          csrfCookie: rawToken,
          csrfHeader: rawToken,
        }),
        {} as Response,
        next,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejeita request com header HMAC forjado (secret errado)', () => {
    const mw = new CsrfMiddleware(makeConfigService(TEST_SECRET));
    const rawToken =
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const forged = hmac('wrong-secret', rawToken);

    expect(() =>
      mw.use(
        makeRequest({
          method: 'POST',
          path: '/dds/dds-1/signature-invites',
          csrfCookie: rawToken,
          csrfHeader: forged,
        }),
        {} as Response,
        next,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejeita request com header não-hex quando HMAC está ativo', () => {
    const mw = new CsrfMiddleware(makeConfigService(TEST_SECRET));

    expect(() =>
      mw.use(
        makeRequest({
          method: 'POST',
          path: '/dds/dds-1/signature-invites',
          csrfCookie: 'some-raw-token',
          csrfHeader: 'not-hex!!',
        }),
        {} as Response,
        next,
      ),
    ).toThrow(ForbiddenException);
  });
});
