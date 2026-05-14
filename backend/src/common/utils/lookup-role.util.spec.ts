import { Role } from '../../auth/enums/roles.enum';
import { resolveLookupRole } from './lookup-role.util';

describe('resolveLookupRole', () => {
  it('classifica administradores como admin', () => {
    expect(resolveLookupRole(Role.ADMIN_GERAL)).toBe('admin');
    expect(resolveLookupRole(Role.ADMIN_EMPRESA)).toBe('admin');
  });

  it('classifica perfis operacionais como manager', () => {
    expect(resolveLookupRole(Role.TST)).toBe('manager');
    expect(resolveLookupRole(Role.SUPERVISOR)).toBe('manager');
  });

  it('classifica perfis demais como user', () => {
    expect(resolveLookupRole(Role.COLABORADOR)).toBe('user');
    expect(resolveLookupRole('')).toBe('user');
    expect(resolveLookupRole(null)).toBe('user');
  });
});
