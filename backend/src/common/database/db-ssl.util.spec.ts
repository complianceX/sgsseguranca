import {
  doesDatabaseUrlRequireSsl,
  parseBooleanFlag,
  resolveDbSslOptions,
} from './db-ssl.util';

describe('db-ssl.util', () => {
  describe('parseBooleanFlag', () => {
    it('interpreta string true/false e booleanos', () => {
      expect(parseBooleanFlag(true)).toBe(true);
      expect(parseBooleanFlag(false)).toBe(false);
      expect(parseBooleanFlag('true')).toBe(true);
      expect(parseBooleanFlag('TRUE')).toBe(true);
      expect(parseBooleanFlag(' false ')).toBe(false);
      expect(parseBooleanFlag(undefined)).toBe(false);
    });
  });

  describe('resolveDbSslOptions', () => {
    it('falha em producao quando SSL nao foi habilitado', () => {
      expect(() =>
        resolveDbSslOptions({
          isProduction: true,
          sslEnabled: false,
          sslCA: undefined,
          allowInsecure: false,
        }),
      ).toThrow('DATABASE_SSL=true');
    });

    it('bloqueia modo inseguro explicito em producao', () => {
      expect(() =>
        resolveDbSslOptions({
          isProduction: true,
          sslEnabled: false,
          sslCA: undefined,
          allowInsecure: true,
        }),
      ).toThrow('DATABASE_SSL_ALLOW_INSECURE');
    });

    it('usa validacao de certificado quando SSL esta habilitado', () => {
      expect(
        resolveDbSslOptions({
          isProduction: true,
          sslEnabled: true,
          sslCA: undefined,
          allowInsecure: false,
        }),
      ).toEqual({ rejectUnauthorized: true });
    });

    it('aplica CA customizado quando informado', () => {
      expect(
        resolveDbSslOptions({
          isProduction: true,
          sslEnabled: true,
          sslCA: 'cert',
          allowInsecure: false,
        }),
      ).toEqual({ rejectUnauthorized: true, ca: 'cert' });
    });
  });

  describe('doesDatabaseUrlRequireSsl', () => {
    it('detecta sslmode=require na URL', () => {
      expect(
        doesDatabaseUrlRequireSsl(
          'postgresql://user:pass@host:5432/db?sslmode=require',
        ),
      ).toBe(true);
    });

    it('detecta protocolo postgresqls', () => {
      expect(
        doesDatabaseUrlRequireSsl('postgresqls://user:pass@host:5432/db'),
      ).toBe(true);
    });

    it('retorna false quando a URL nao exige SSL', () => {
      expect(
        doesDatabaseUrlRequireSsl('postgresql://user:pass@host:5432/db'),
      ).toBe(false);
      expect(doesDatabaseUrlRequireSsl(undefined)).toBe(false);
    });
  });
});
