import {
  buildOtpauthUri,
  generateRecoveryCode,
  generateTotpCode,
  verifyTotpCode,
} from './totp.util';

describe('totp.util', () => {
  it('gera e valida um TOTP determinístico', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const time = new Date('2026-04-13T12:00:00.000Z');
    const code = generateTotpCode({ secret, time });

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode({ secret, code, time })).toBe(true);
  });

  it('rejeita código fora da janela', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const generatedAt = new Date('2026-04-13T12:00:00.000Z');
    const validationAt = new Date('2026-04-13T12:03:00.000Z');
    const code = generateTotpCode({ secret, time: generatedAt });

    expect(verifyTotpCode({ secret, code, time: validationAt })).toBe(false);
  });

  it('gera recovery code e otpauth URI seguros', () => {
    const recoveryCode = generateRecoveryCode();
    const otpAuthUrl = buildOtpauthUri({
      issuer: 'SGS Segurança',
      label: '12345678900',
      secret: 'JBSWY3DPEHPK3PXP',
    });

    expect(recoveryCode).toMatch(/^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/);
    expect(otpAuthUrl).toContain('otpauth://totp/');
    expect(otpAuthUrl).toContain('issuer=SGS%20Seguran%C3%A7a');
  });
});
