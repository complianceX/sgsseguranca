import { Role } from '../../src/auth/enums/roles.enum';
import { TestApp } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E Critical - Auth complete flow', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should login, fetch me, refresh, logout and reject old token', async () => {
    const adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');

    expect(adminSession.accessToken).toBeTruthy();
    expect(adminSession.refreshCookie.startsWith('refresh_token=')).toBe(true);

    const meResponse = await testApp
      .request()
      .get('/auth/me')
      .set(testApp.authHeaders(adminSession));
    const meBody = meResponse.body as { user?: { id?: string } };

    expect(meResponse.status).toBe(200);
    expect(meBody.user?.id).toBe(adminSession.userId);

    const refreshCsrfHeaders = await testApp.csrfHeaders();
    const refreshResponse = await testApp
      .request()
      .post('/auth/refresh')
      .set(
        'Cookie',
        `${adminSession.refreshCookie}; ${adminSession.refreshCsrfCookie}; ${refreshCsrfHeaders.Cookie}`,
      )
      .set('x-refresh-csrf', adminSession.refreshCsrfToken)
      .set('x-csrf-token', refreshCsrfHeaders['x-csrf-token']);
    const refreshBody = refreshResponse.body as { accessToken?: string };

    expect(refreshResponse.status).toBe(201);
    expect(typeof refreshBody.accessToken).toBe('string');
    expect(String(refreshBody.accessToken).length).toBeGreaterThan(20);

    const logoutCsrfHeaders = await testApp.csrfHeaders();
    const logoutResponse = await testApp
      .request()
      .post('/auth/logout')
      .set(testApp.authHeaders(adminSession))
      .set('x-csrf-token', logoutCsrfHeaders['x-csrf-token'])
      .set('Cookie', `${adminSession.refreshCookie}; ${logoutCsrfHeaders.Cookie}`);

    expect(logoutResponse.status).toBe(201);
    expect(logoutResponse.body).toEqual({ success: true });

    const oldTokenResponse = await testApp
      .request()
      .get('/auth/me')
      .set(testApp.authHeaders(adminSession));

    expect(oldTokenResponse.status).toBe(401);
  });
});
