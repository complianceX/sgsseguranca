import { Role } from '../../src/auth/enums/roles.enum';
import { createApr } from '../factories/apr.factory';
import { TestApp } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E Critical - Role permissions', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should enforce APR create permission and admin-only users listing', async () => {
    const workerSession = await testApp.loginAs(Role.TRABALHADOR, 'tenantA');
    const tstSession = await testApp.loginAs(Role.TST, 'tenantA');
    const adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    const tenantA = testApp.getTenant('tenantA');
    const tecnicA = testApp.getUser('tenantA', Role.TST);

    const workerCreateApr = await testApp
      .request()
      .post('/aprs')
      .set(testApp.authHeaders(workerSession))
      .send({
        numero: 'APR-WORKER-001',
        titulo: 'APR Worker',
        data_inicio: '2026-03-24',
        data_fim: '2026-03-25',
        site_id: tenantA.siteId,
        elaborador_id: workerSession.userId,
      });

    expect(workerCreateApr.status).toBe(403);

    const tstApr = await createApr(testApp, tstSession, {
      numero: 'APR-TST-001',
      titulo: 'APR Técnico',
      siteId: tenantA.siteId,
      elaboradorId: tecnicA.id,
    });

    expect(tstApr.id).toBeTruthy();

    const adminUsers = await testApp
      .request()
      .get('/users?page=1&limit=10')
      .set(testApp.authHeaders(adminSession));
    const adminUsersBody = adminUsers.body as { data?: unknown[] };

    expect(adminUsers.status).toBe(200);
    expect(Array.isArray(adminUsersBody.data)).toBe(true);

    const workerUsers = await testApp
      .request()
      .get('/users?page=1&limit=10')
      .set(testApp.authHeaders(workerSession));

    expect(workerUsers.status).toBe(403);
  });
});
