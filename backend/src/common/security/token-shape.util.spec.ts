import { BadRequestException } from '@nestjs/common';
import {
  assertValidBase64UrlToken,
  assertValidHexToken,
} from './token-shape.util';

describe('token-shape.util', () => {
  it('aceita token base64url válido', () => {
    const token = 'A'.repeat(43);
    expect(assertValidBase64UrlToken(token)).toBe(token);
  });

  it('rejeita token base64url curto', () => {
    expect(() => assertValidBase64UrlToken('abc')).toThrow(BadRequestException);
  });

  it('rejeita token base64url com caracteres inválidos', () => {
    expect(() => assertValidBase64UrlToken('A'.repeat(42) + '+')).toThrow(
      BadRequestException,
    );
  });

  it('aceita token hexadecimal de tamanho exato', () => {
    const token = 'A'.repeat(64);
    expect(assertValidHexToken(token, 64)).toBe(token.toLowerCase());
  });

  it('rejeita token hexadecimal com tamanho incorreto', () => {
    expect(() => assertValidHexToken('a'.repeat(63), 64)).toThrow(
      BadRequestException,
    );
  });

  it('rejeita token hexadecimal com caracteres inválidos', () => {
    expect(() => assertValidHexToken('g'.repeat(64), 64)).toThrow(
      BadRequestException,
    );
  });
});
