import { BadRequestException } from '@nestjs/common';
import {
  assertValidSignedToken,
  isLikelySignedToken,
  normalizeSignedToken,
} from './signed-token.util';

describe('signed-token.util', () => {
  it('normaliza token com trim', () => {
    expect(normalizeSignedToken('  aaa.bbb.ccc  ')).toBe('aaa.bbb.ccc');
  });

  it('reconhece token assinado com formato esperado', () => {
    expect(isLikelySignedToken('aaa.bbb.ccc')).toBe(true);
  });

  it('rejeita token bruto sem separadores de assinatura', () => {
    expect(isLikelySignedToken('token-bruto')).toBe(false);
  });

  it('lança BadRequestException para token inválido', () => {
    expect(() => assertValidSignedToken('token-bruto')).toThrow(
      BadRequestException,
    );
  });
});
