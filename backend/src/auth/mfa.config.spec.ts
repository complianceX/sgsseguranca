import { Role } from './enums/roles.enum';
import { normalizePrivilegedRole } from './mfa.config';

describe('mfa.config', () => {
  it('classifica ADMIN_GERAL como privilegiado mesmo com variação de formato', () => {
    expect(normalizePrivilegedRole(Role.ADMIN_GERAL)).toBe('ADMIN_GERAL');
    expect(normalizePrivilegedRole('ADMIN_GERAL')).toBe('ADMIN_GERAL');
    expect(normalizePrivilegedRole(' admin geral ')).toBe('ADMIN_GERAL');
    expect(normalizePrivilegedRole('administrador geral')).toBe('ADMIN_GERAL');
  });

  it('classifica ADMIN_EMPRESA como privilegiado', () => {
    expect(normalizePrivilegedRole(Role.ADMIN_EMPRESA)).toBe('ADMIN_EMPRESA');
    expect(normalizePrivilegedRole('ADMIN_EMPRESA')).toBe('ADMIN_EMPRESA');
    expect(normalizePrivilegedRole('administrador da empresa')).toBe(
      'ADMIN_EMPRESA',
    );
  });

  it('mantém perfis não privilegiados fora da exigência de MFA obrigatório', () => {
    expect(normalizePrivilegedRole('Operador / Colaborador')).toBe(
      'NON_PRIVILEGED',
    );
    expect(normalizePrivilegedRole(undefined)).toBe('NON_PRIVILEGED');
  });
});
