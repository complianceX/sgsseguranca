import { Role } from '../../src/modules/auth/enums/roles.enum';
import { AprStatus } from '../../src/modules/aprs/entities/apr.entity';
import { createApr } from '../factories/apr.factory';
import { TestApp, type LoginSession } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

type AprBody = {
  id?: string;
  status?: string;
  titulo?: string;
  parent_apr_id?: string | null;
  pdf_file_key?: string | null;
};

type PageBody<T = AprBody> = {
  data?: T[];
  total?: number;
  page?: number;
  lastPage?: number;
};

describeE2E('E2E Critical - APR lifecycle (versões e RBAC)', () => {
  let testApp: TestApp;

  let adminSession: LoginSession;
  let tstSession: LoginSession;
  let workerSession: LoginSession;
  let adminSessionB: LoginSession;
  let csrfHeaders: Record<string, string>;

  // APR simples (PENDENTE) em tenantA para isolamento cross-tenant — sem PDF
  let aprTenantAId: string;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();

    adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    tstSession = await testApp.loginAs(Role.TST, 'tenantA');
    workerSession = await testApp.loginAs(Role.TRABALHADOR, 'tenantA');
    adminSessionB = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantB');
    csrfHeaders = await testApp.csrfHeaders();

    const tenantA = testApp.getTenant('tenantA');
    const tst = testApp.getUser('tenantA', Role.TST);

    const apr = await createApr(testApp, tstSession, {
      numero: 'APR-TENANT-ISO-001',
      titulo: 'APR Para Teste de Isolamento de Tenant',
      siteId: tenantA.siteId,
      elaboradorId: tst.id,
    });

    aprTenantAId = apr.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  // =========================================================================
  // Fluxo 3 — Nova versão (a partir de APR Aprovada)
  //
  // ATENÇÃO: new-version exige status APROVADA. Criamos uma APR dedicada aqui
  // e a aprovamos (sem finalizar) para exercitar este endpoint corretamente.
  // Nenhuma geração de PDF ocorre neste fluxo.
  // =========================================================================
  describe('Fluxo 3 — Nova versão (a partir de APR Aprovada)', () => {
    let aprOriginalId: string;
    let newVersionId: string;

    beforeAll(async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-NEWVER-001',
        titulo: 'APR Base Para Nova Versão',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      const approveRes = await testApp
        .request()
        .patch(`/aprs/${apr.id}/approve`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders)
        .send({ reason: 'Aprovada para exercitar new-version' });

      expect([200, 201]).toContain(approveRes.status);
      aprOriginalId = apr.id;
    });

    it('3.1 POST /aprs/:id/new-version → cria nova versão com status Pendente', async () => {
      const res = await testApp
        .request()
        .post(`/aprs/${aprOriginalId}/new-version`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      const body = res.body as AprBody;
      expect([200, 201]).toContain(res.status);
      expect(body.status).toBe(AprStatus.PENDENTE);
      expect(body.id).toBeTruthy();
      expect(body.id).not.toBe(aprOriginalId);
      expect(body.parent_apr_id).toBe(aprOriginalId);

      newVersionId = body.id as string;
    });

    it('3.2 GET /aprs/:originalId → versão original mantém status Aprovada', async () => {
      const res = await testApp
        .request()
        .get(`/aprs/${aprOriginalId}`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      const body = res.body as AprBody;
      expect(res.status).toBe(200);
      expect(body.status).toBe(AprStatus.APROVADA);
    });

    it('3.3 GET /aprs/:newVersionId → nova versão existe e está Pendente', async () => {
      const res = await testApp
        .request()
        .get(`/aprs/${newVersionId}`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      const body = res.body as AprBody;
      expect(res.status).toBe(200);
      expect(body.id).toBe(newVersionId);
      expect(body.status).toBe(AprStatus.PENDENTE);
      expect(body.parent_apr_id).toBe(aprOriginalId);
    });

    it('3.4 Nova versão não herda pdf_file_key da versão original', async () => {
      const res = await testApp
        .request()
        .get(`/aprs/${newVersionId}`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      const body = res.body as AprBody;
      expect(res.status).toBe(200);

      if (Object.prototype.hasOwnProperty.call(body, 'pdf_file_key')) {
        expect(body.pdf_file_key).toBeFalsy();
      }
    });

    it('3.5 GET /aprs (listagem) → ambas as versões visíveis para o mesmo tenant', async () => {
      const res = await testApp
        .request()
        .get('/aprs?page=1&limit=100')
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      const body = res.body as PageBody;
      const items = Array.isArray(body.data) ? body.data : [];
      const ids = items.map((i) => i.id);

      expect(res.status).toBe(200);
      expect(ids).toContain(aprOriginalId);
      expect(ids).toContain(newVersionId);
    });

    it('3.6 POST /aprs/:id/new-version em APR Pendente → 400 (requer Aprovada)', async () => {
      const res = await testApp
        .request()
        .post(`/aprs/${newVersionId}/new-version`)
        .set(testApp.authHeaders(adminSession))
        .set(csrfHeaders);

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // Fluxo 4 — Permissões por role e isolamento de tenant
  // =========================================================================
  describe('Fluxo 4 — Permissões por role e isolamento de tenant', () => {
    it('4.1 TRABALHADOR não pode criar APR → 403', async () => {
      const tenantA = testApp.getTenant('tenantA');

      const res = await testApp
        .request()
        .post('/aprs')
        .set(testApp.authHeaders(workerSession))
        .set(csrfHeaders)
        .send({
          numero: 'APR-WORKER-BLOCK-001',
          titulo: 'APR Bloqueada por Role',
          data_inicio: '2026-03-24',
          data_fim: '2026-03-25',
          site_id: tenantA.siteId,
          elaborador_id: workerSession.userId,
          participants: [workerSession.userId],
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

      expect(res.status).toBe(403);
    });

    it('4.2 TST pode criar APR → 201', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-TST-ROLE-001',
        titulo: 'APR Criada por TST',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      expect(apr.id).toBeTruthy();
      expect(apr.status).toBe(AprStatus.PENDENTE);
    });

    it('4.3 TRABALHADOR não pode aprovar APR do mesmo tenant → 403', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-WORKER-APPROVE-BLOCK',
        titulo: 'APR Para Bloqueio de Aprovação',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      const res = await testApp
        .request()
        .patch(`/aprs/${apr.id}/approve`)
        .set(testApp.authHeaders(workerSession))
        .set(csrfHeaders)
        .send({});

      expect(res.status).toBe(403);
    });

    it('4.4 Usuário de tenant B acessa APR do tenant A → 404 (não 403)', async () => {
      const res = await testApp
        .request()
        .get(`/aprs/${aprTenantAId}`)
        .set(testApp.authHeaders(adminSessionB))
        .set(csrfHeaders);

      expect(res.status).toBe(404);
    });

    it('4.5 Listagem do tenant B não inclui APRs do tenant A', async () => {
      const res = await testApp
        .request()
        .get('/aprs?page=1&limit=100')
        .set(testApp.authHeaders(adminSessionB))
        .set(csrfHeaders);

      const body = res.body as PageBody;
      const items = Array.isArray(body.data) ? body.data : [];

      expect(res.status).toBe(200);
      expect(items.some((item) => item.id === aprTenantAId)).toBe(false);
    });

    it('4.6 Tenant B não pode aprovar APR do tenant A via spoofing de ID → 404', async () => {
      const res = await testApp
        .request()
        .patch(`/aprs/${aprTenantAId}/approve`)
        .set(testApp.authHeaders(adminSessionB))
        .set(csrfHeaders)
        .send({});

      expect(res.status).toBe(404);
    });
  });
});
