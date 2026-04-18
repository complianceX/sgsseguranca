import { Role } from '../../src/auth/enums/roles.enum';
import type { TestApp, LoginSession } from './test-app';

export async function loginAs(
  testApp: TestApp,
  role: Role,
  tenant: 'tenantA' | 'tenantB' = 'tenantA',
): Promise<LoginSession> {
  return testApp.loginAs(role, tenant);
}

export async function loginAsAdmin(testApp: TestApp): Promise<LoginSession> {
  return testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
}

export async function loginAsTst(testApp: TestApp): Promise<LoginSession> {
  return testApp.loginAs(Role.TST, 'tenantA');
}

export function authHeaders(
  testApp: TestApp,
  session: LoginSession,
  options?: { companyIdOverride?: string },
): Record<string, string> {
  return testApp.authHeaders(session, options);
}

export async function csrfHeaders(
  testApp: TestApp,
): Promise<Record<string, string>> {
  return testApp.csrfHeaders();
}
