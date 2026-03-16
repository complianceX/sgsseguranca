import { parseBooleanFlag, resolveDbSslOptions } from './db-ssl.util';

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

    it('permite modo inseguro explicito em producao', () => {
      expect(
        resolveDbSslOptions({
          isProduction: true,
          sslEnabled: false,
          sslCA: undefined,
          allowInsecure: true,
        }),
      ).toEqual({ rejectUnauthorized: false });
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
});
