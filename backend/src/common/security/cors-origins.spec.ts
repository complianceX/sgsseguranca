import { isCorsOriginAllowed, resolveAllowedCorsOrigins } from './cors-origins';

describe('cors-origins', () => {
  describe('resolveAllowedCorsOrigins', () => {
    it('inclui origem canônica de produção mesmo sem env', () => {
      const origins = resolveAllowedCorsOrigins({
        isProduction: true,
        configuredOriginsRaw: '',
      });

      expect(origins).toContain('https://app.sgsseguranca.com.br');
    });
  });

  describe('isCorsOriginAllowed', () => {
    it('permite origem explicitamente autorizada', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'https://app.sgsseguranca.com.br',
        allowedOrigins: ['https://app.sgsseguranca.com.br'],
        isProduction: true,
      });

      expect(allowed).toBe(true);
    });

    it('bloqueia origem maliciosa em produção', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'https://evil.example',
        allowedOrigins: ['https://app.sgsseguranca.com.br'],
        isProduction: true,
      });

      expect(allowed).toBe(false);
    });

    it('permite localhost quando origem está explicitamente autorizada', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'http://localhost:3000',
        allowedOrigins: ['http://localhost:3000'],
        isProduction: false,
      });

      expect(allowed).toBe(true);
    });

    it('bloqueia origem de rede privada em não-produção por padrão', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'http://192.168.0.15:3000',
        allowedOrigins: ['http://localhost:3000'],
        isProduction: false,
      });

      expect(allowed).toBe(false);
    });

    it('permite origem de rede privada em não-produção com opt-in explícito', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'http://192.168.0.15:3000',
        allowedOrigins: ['http://localhost:3000'],
        isProduction: false,
        allowPrivateNetworkDevOrigins: true,
      });

      expect(allowed).toBe(true);
    });

    it('bloqueia localhost em produção quando não estiver explicitamente autorizado', () => {
      const allowed = isCorsOriginAllowed({
        origin: 'http://localhost:3000',
        allowedOrigins: ['https://app.sgsseguranca.com.br'],
        isProduction: true,
      });

      expect(allowed).toBe(false);
    });

    it('bloqueia quando origin está ausente ou null literal', () => {
      expect(
        isCorsOriginAllowed({
          origin: undefined,
          allowedOrigins: ['https://app.sgsseguranca.com.br'],
          isProduction: true,
        }),
      ).toBe(false);

      expect(
        isCorsOriginAllowed({
          origin: 'null',
          allowedOrigins: ['https://app.sgsseguranca.com.br'],
          isProduction: true,
        }),
      ).toBe(false);
    });
  });
});
