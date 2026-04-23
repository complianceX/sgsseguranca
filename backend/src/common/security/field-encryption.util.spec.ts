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
});
