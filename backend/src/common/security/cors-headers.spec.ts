import { ALLOWED_CORS_HEADERS } from './cors-headers';

describe('ALLOWED_CORS_HEADERS', () => {
  it('permite os headers CSRF exigidos pelo frontend', () => {
    expect(ALLOWED_CORS_HEADERS).toEqual(
      expect.arrayContaining(['x-csrf-token', 'x-refresh-csrf']),
    );
  });

  it('tolera headers de cache enviados por browsers e clientes HTTP', () => {
    expect(ALLOWED_CORS_HEADERS).toEqual(
      expect.arrayContaining(['Cache-Control', 'Pragma']),
    );
  });

  it('permite o header de idempotência exigido pelo módulo de importação de documentos', () => {
    expect(ALLOWED_CORS_HEADERS).toEqual(
      expect.arrayContaining(['Idempotency-Key']),
    );
  });

  it('não contém duplicatas', () => {
    expect(new Set(ALLOWED_CORS_HEADERS).size).toBe(
      ALLOWED_CORS_HEADERS.length,
    );
  });
});
