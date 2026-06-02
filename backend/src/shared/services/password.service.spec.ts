import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should hash password', async () => {
      const hash = await service.hash('password123');
      expect(hash).not.toBe('password123');
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('compare', () => {
    it('should return true for matching password', async () => {
      const hash = await service.hash('password123');
      const isMatch = await service.compare('password123', hash);
      expect(isMatch).toBe(true);
    });

    it('should return false for non-matching password', async () => {
      const hash = await service.hash('password123');
      const isMatch = await service.compare('wrongpassword', hash);
      expect(isMatch).toBe(false);
    });
  });

  describe('validate', () => {
    it('should validate strong password', () => {
      const result = service.validate('Segur0@Forte!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject weak password', () => {
      const result = service.validate('weak');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject passwords containing common blocked patterns', () => {
      const result = service.validate('Password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Senha contém padrões comuns e inseguros',
      );
    });

    it('should reject passwords with repeated characters', () => {
      const result = service.validate('Aaaa1234!@');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Senha não pode conter caracteres repetidos em sequência',
      );
    });
  });
});
