import { normalizePublicApiBaseUrl } from './public-api-url';

describe('normalizePublicApiBaseUrl', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.sgsseguranca.com.br';
    process.env.NEXT_PUBLIC_SITE_URL = '';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('redirects the canonical production API origin to the same-origin proxy path', () => {
    expect(
      normalizePublicApiBaseUrl('https://api.sgsseguranca.com.br'),
    ).toBe('https://app.sgsseguranca.com.br/proxy');
  });

  it('redirects the legacy Render host to the same-origin proxy path', () => {
    expect(
      normalizePublicApiBaseUrl('https://sgs-backend-web-d49b.onrender.com'),
    ).toBe('https://app.sgsseguranca.com.br/proxy');
  });

  it('keeps local API URLs intact for development', () => {
    expect(normalizePublicApiBaseUrl('http://localhost:3011')).toBe(
      'http://localhost:3011',
    );
  });
});
