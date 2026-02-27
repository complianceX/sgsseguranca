import { CpfUtil } from './cpf.util';

describe('CpfUtil', () => {
  describe('validate', () => {
    it('should validate correct CPF', () => {
      // 12345678909 is a valid CPF algorithmically (123.456.789-09)
      expect(CpfUtil.validate('12345678909')).toBe(true);
    });

    it('should reject invalid CPF', () => {
      expect(CpfUtil.validate('12345678900')).toBe(false);
    });

    it('should reject CPF with all same digits', () => {
      expect(CpfUtil.validate('11111111111')).toBe(false);
    });

    it('should reject CPF with wrong length', () => {
      expect(CpfUtil.validate('123456789')).toBe(false);
    });

    it('should validate CPF with formatting', () => {
      expect(CpfUtil.validate('529.982.247-25')).toBe(true);
    });
  });

  describe('format', () => {
    it('should format CPF correctly', () => {
      expect(CpfUtil.format('12345678909')).toBe('123.456.789-09');
    });
  });

  describe('normalize', () => {
    it('should remove formatting', () => {
      expect(CpfUtil.normalize('123.456.789-09')).toBe('12345678909');
    });
  });
});
