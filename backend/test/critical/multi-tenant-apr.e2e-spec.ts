import { Role } from '../../src/auth/enums/roles.enum';
import { createApr } from '../factories/apr.factory';
import { TestApp } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E Critical - Multi-tenant isolation (APR)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should isolate APR records between tenants and block cross-tenant header spoofing', async () => {
    const adminA = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    const adminB = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantB');
    const csrfHeaders = await testApp.csrfHeaders();

    const tenantA = testApp.getTenant('tenantA');
    const tenantB = testApp.getTenant('tenantB');
    const tecnicA = testApp.getUser('tenantA', Role.TST);
    const tecnicB = testApp.getUser('tenantB', Role.TST);

    const aprA = await createApr(testApp, adminA, {
      numero: 'APR-A-001',
      titulo: 'APR Tenant A',
      siteId: tenantA.siteId,
      elaboradorId: tecnicA.id,
    });

    const listB = await testApp
      .request()
      .get('/aprs?page=1&limit=20')
      .set(testApp.authHeaders(adminB));
    const listBody = listB.body as { data?: Array<{ id?: string }> };
    const listItems = Array.isArray(listBody.data) ? listBody.data : [];

    expect(listB.status).toBe(200);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(listItems.some((item) => item.id === aprA.id)).toBe(false);

    const crossTenantGet = await testApp
      .request()
      .get(`/aprs/${aprA.id}`)
      .set(testApp.authHeaders(adminB));

    expect(crossTenantGet.status).toBe(404);

    const spoofedHeaderCreate = await testApp
      .request()
      .post('/aprs')
      .set(
        testApp.authHeaders(adminB, {
          companyIdOverride: tenantA.companyId,
        }),
      )
      .set(csrfHeaders)
      .send({
        numero: 'APR-SPOOF-001',
        titulo: 'APR Spoof',
        data_inicio: '2026-03-24',
        data_fim: '2026-03-25',
        site_id: tenantB.siteId,
        elaborador_id: tecnicB.id,
        participants: [tecnicB.id],
        risk_items: [
          {
            atividade: 'Atividade',
            agente_ambiental: 'Ruído',
            condicao_perigosa: 'Condição',
            fonte_circunstancia: 'Fonte',
            lesao: 'Lesão',
            probabilidade: 2,
            severidade: 2,
            medidas_prevencao: 'Controle',
            responsavel: 'Responsável',
          },
        ],
      });

    expect(spoofedHeaderCreate.status).toBe(403);
  });
});
