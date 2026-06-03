import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
} from './field-encryption.util';

describe('field-encryption.util', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FIELD_ENCRYPTION_ENABLED: 'true',
      FIELD_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      FIELD_ENCRYPTION_HASH_KEY: 'hash-secret',
      NODE_ENV: 'test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('criptografa e decriptografa valor sensível', () => {
    const encrypted = encryptSensitiveValue('12345678900');
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(decryptSensitiveValue(encrypted)).toBe('12345678900');
  });

  it('gera hash determinístico para busca/indexação', () => {
    expect(hashSensitiveValue('12345678900')).toBe(
      hashSensitiveValue('12345678900'),
    );
    expect(hashSensitiveValue('12345678900')).not.toBe(
      hashSensitiveValue('00000000000'),
    );
  });

  it('mantém compatibilidade para valores legados em texto plano', () => {
    expect(decryptSensitiveValue('texto-legado')).toBe('texto-legado');
  });

  describe('fail-fast em produção', () => {
    it('lança se FIELD_ENCRYPTION_KEY estiver ausente em produção com encryption habilitada', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIELD_ENCRYPTION_ENABLED = 'true';
      delete process.env.FIELD_ENCRYPTION_KEY;

      expect(() => encryptSensitiveValue('teste')).toThrow(
        /FIELD_ENCRYPTION_KEY/,
      );
    });

    it('lança se FIELD_ENCRYPTION_HASH_KEY estiver ausente em produção e não houver fallback via FIELD_ENCRYPTION_KEY', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIELD_ENCRYPTION_ENABLED = 'true';
      delete process.env.FIELD_ENCRYPTION_HASH_KEY;
      delete process.env.FIELD_ENCRYPTION_KEY;

      expect(() => hashSensitiveValue('12345678900')).toThrow(
        /FIELD_ENCRYPTION_HASH_KEY/,
      );
    });

    it('aceita FIELD_ENCRYPTION_KEY como fallback para hash em produção', () => {
      process.env.NODE_ENV = 'production';
      process.env.FIELD_ENCRYPTION_ENABLED = 'true';
      process.env.FIELD_ENCRYPTION_KEY =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      delete process.env.FIELD_ENCRYPTION_HASH_KEY;

      expect(() => hashSensitiveValue('12345678900')).not.toThrow();
    });

    it('não lança em desenvolvimento quando a criptografia está desabilitada e hash key ausente', () => {
      process.env.NODE_ENV = 'development';
      process.env.FIELD_ENCRYPTION_ENABLED = 'false';
      delete process.env.FIELD_ENCRYPTION_HASH_KEY;
      delete process.env.FIELD_ENCRYPTION_KEY;

      expect(() => hashSensitiveValue('teste')).not.toThrow();
    });

    it('lança em qualquer ambiente quando a chave de criptografia configurada é inválida', () => {
      process.env.NODE_ENV = 'development';
      process.env.FIELD_ENCRYPTION_ENABLED = 'true';
      process.env.FIELD_ENCRYPTION_KEY = 'CHANGE_THIS_TO_A_32_BYTE_FIELD_KEY';

      expect(() => encryptSensitiveValue('teste')).toThrow(
        /FIELD_ENCRYPTION_KEY/,
      );
    });
  });
});
