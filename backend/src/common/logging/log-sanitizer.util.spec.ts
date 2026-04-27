import {
  maskSensitiveText,
  sanitizeLogObject,
  sanitizeLogUrl,
} from './log-sanitizer.util';

describe('log-sanitizer.util', () => {
  it('redacts token query params and masks CPF/e-mail in URLs', () => {
    expect(
      sanitizeLogUrl(
        '/documentos/publicos?token=abc123&cpf=123.456.789-00&email=user@example.com&page=1',
      ),
    ).toBe(
      '/documentos/publicos?token=***REDACTED***&cpf=123.***.***-**&email=u***%40example.com&page=1',
    );
  });

  it('masks sensitive values inside nested objects', () => {
    expect(
      sanitizeLogObject({
        cpf: '12345678900',
        nested: {
          email: 'titular@example.com',
          refresh_token: 'secret-token',
        },
      }),
    ).toEqual({
      cpf: '123.***.***-**',
      nested: {
        email: 't***@example.com',
        refresh_token: '***REDACTED***',
      },
    });
  });

  it('masks bearer and Cloudflare tokens inside free text', () => {
    const cloudflareTokenFixture = 'cfut' + '_TESTTOKENVALUE1234567890';

    expect(
      maskSensitiveText(
        `Authorization Bearer REDACTED ${cloudflareTokenFixture}`,
      ),
    ).toBe('Authorization Bearer ***REDACTED*** ***REDACTED***');
  });
});
