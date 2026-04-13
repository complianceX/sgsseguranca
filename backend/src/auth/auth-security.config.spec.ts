import {
  getRequestCsrfCookieOptions,
  getRefreshCsrfCookieOptions,
  getRefreshTokenCookieOptions,
} from './auth-security.config';

describe('auth-security.config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      AUTH_COOKIE_DOMAIN: '.sgsseguranca.com.br',
      AUTH_COOKIE_SAMESITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('mantém refresh_token restrito à rota de refresh', () => {
    expect(getRefreshTokenCookieOptions()).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/auth/refresh',
        domain: '.sgsseguranca.com.br',
      }),
    );
  });

  it('expõe refresh_csrf no escopo necessário para o frontend ler e refletir no header', () => {
    expect(getRefreshCsrfCookieOptions()).toEqual(
      expect.objectContaining({
        httpOnly: false,
        secure: true,
        sameSite: 'strict',
        path: '/',
        domain: '.sgsseguranca.com.br',
      }),
    );
  });

  it('expõe csrf-token no domínio compartilhado entre app e api', () => {
    expect(getRequestCsrfCookieOptions()).toEqual(
      expect.objectContaining({
        httpOnly: false,
        secure: true,
        sameSite: 'strict',
        path: '/',
        domain: '.sgsseguranca.com.br',
      }),
    );
  });
});
