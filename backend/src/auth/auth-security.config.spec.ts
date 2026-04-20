import {
  getAccessTokenTtl,
  getLegacyRequestCsrfClearCookieOptions,
  getRequestCsrfCookieOptions,
  getRefreshCsrfCookieOptions,
  getRefreshTokenTtl,
  getRefreshTokenTtlDays,
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

  it('prioriza ACCESS_TOKEN_TTL sobre JWT_EXPIRES_IN', () => {
    process.env.ACCESS_TOKEN_TTL = '20m';
    process.env.JWT_EXPIRES_IN = '10m';

    expect(getAccessTokenTtl()).toBe('20m');
  });

  it('usa REFRESH_TOKEN_TTL quando configurado', () => {
    process.env.REFRESH_TOKEN_TTL = '12h';
    process.env.REFRESH_TOKEN_TTL_DAYS = '14';

    expect(getRefreshTokenTtl()).toBe('12h');
    expect(getRefreshTokenTtlDays()).toBe(1);
  });

  it('faz fallback para REFRESH_TOKEN_TTL_DAYS quando REFRESH_TOKEN_TTL é inválido', () => {
    process.env.REFRESH_TOKEN_TTL = 'abc';
    process.env.REFRESH_TOKEN_TTL_DAYS = '21';

    expect(getRefreshTokenTtl()).toBe('21d');
    expect(getRefreshTokenTtlDays()).toBe(21);
  });

  it('mantém compatibilidade com JWT_REFRESH_EXPIRATION legado', () => {
    process.env.REFRESH_TOKEN_TTL = '';
    delete process.env.REFRESH_TOKEN_TTL_DAYS;
    process.env.JWT_REFRESH_EXPIRATION = '36h';

    expect(getRefreshTokenTtl()).toBe('2d');
    expect(getRefreshTokenTtlDays()).toBe(2);
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

  it('limpa o csrf-token legado host-only da api antes de emitir o novo cookie compartilhado', () => {
    expect(getLegacyRequestCsrfClearCookieOptions()).toEqual(
      expect.objectContaining({
        path: '/',
      }),
    );
    expect(getLegacyRequestCsrfClearCookieOptions()).not.toHaveProperty(
      'domain',
    );
  });
});
