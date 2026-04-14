/**
 * Fase 2 — Smoke Tests P0: Regressão dos fluxos principais após Fase 1
 *
 * Verifica que as correções de segurança da Fase 1 NÃO quebraram:
 *   1. Fluxo de autenticação: login → /auth/me → refresh → logout
 *   2. Acesso a rotas comuns por roles corretas (não admin)
 *   3. Isolamento cross-tenant ainda funciona em endpoints de negócio
 *   4. RLS validation endpoints retornam resposta estruturada para ADMIN_GERAL
 *   5. Admin routes agora retornam 401 sem token (antes não exigiam)
 *
 * Pré-condição: docker compose -f docker-compose.test.yml up -d
 */
import { Role } from '../../src/auth/enums/roles.enum';
import { TestApp, type LoginSession } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E P0 Smoke — Regressão Fase 1', () => {
  let testApp: TestApp;

  let adminGeralSession: LoginSession;
  let adminEmpresaSession: LoginSession;
  let tstSession: LoginSession;
  let trabalhadorSession: LoginSession;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();

    adminGeralSession   = await testApp.loginAs(Role.ADMIN_GERAL,   'tenantA');
    adminEmpresaSession = await testApp.loginAs(Role.ADMIN_EMPRESA,  'tenantA');
    tstSession          = await testApp.loginAs(Role.TST,            'tenantA');
    trabalhadorSession  = await testApp.loginAs(Role.TRABALHADOR,    'tenantA');
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Fluxo completo de autenticação (smoke — garante que auth não regrediu)
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: Fluxo de autenticação', () => {
    it('Login com credenciais válidas retorna accessToken e cookie de refresh', async () => {
      expect(adminGeralSession.accessToken).toBeTruthy();
      expect(adminGeralSession.refreshCookie).toMatch(/^refresh_token=/);
    });

    it('GET /auth/me com token válido retorna userId correto', async () => {
      const response = await testApp
        .request()
        .get('/auth/me')
        .set(testApp.authHeaders(adminGeralSession));

      expect(response.status).toBe(200);
      const body = response.body as { user?: { id?: string } };
      expect(body.user?.id).toBe(adminGeralSession.userId);
    });

    it('POST /auth/refresh com cookie válido retorna novo accessToken', async () => {
      const response = await testApp
        .request()
        .post('/auth/refresh')
        .set('Cookie', adminGeralSession.refreshCookie);

      expect(response.status).toBe(201);
      const body = response.body as { accessToken?: string };
      expect(typeof body.accessToken).toBe('string');
      expect(String(body.accessToken).length).toBeGreaterThan(20);
    });

    it('POST /auth/logout invalida a sessão', async () => {
      // Cria sessão separada para não invalidar a sessão dos outros testes
      const tempSession = await testApp.loginAs(Role.TST, 'tenantA');

      const logoutResponse = await testApp
        .request()
        .post('/auth/logout')
        .set(testApp.authHeaders(tempSession))
        .set('Cookie', tempSession.refreshCookie);

      expect(logoutResponse.status).toBe(201);

      // Token antigo deve ser rejeitado após logout
      const oldTokenResponse = await testApp
        .request()
        .get('/auth/me')
        .set(testApp.authHeaders(tempSession));

      expect(oldTokenResponse.status).toBe(401);
    });

    it('GET /auth/me sem token → 401', async () => {
      const response = await testApp.request().get('/auth/me');
      expect(response.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Dashboard — roles legítimos ainda têm acesso (não regrediu)
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: Dashboard acessível por roles corretas', () => {
    const dashboardRoles: Array<{ label: string; session: () => LoginSession }> = [
      { label: 'ADMIN_GERAL',   session: () => adminGeralSession },
      { label: 'ADMIN_EMPRESA', session: () => adminEmpresaSession },
      { label: 'TST',           session: () => tstSession },
      { label: 'TRABALHADOR',   session: () => trabalhadorSession },
    ];

    for (const { label, session } of dashboardRoles) {
      it(`GET /dashboard/summary com ${label} → não 401/403`, async () => {
        const response = await testApp
          .request()
          .get('/dashboard/summary')
          .set(testApp.authHeaders(session()));

        expect([401, 403]).not.toContain(response.status);
      });
    }

    it('GET /dashboard/summary sem token → 401', async () => {
      const response = await testApp.request().get('/dashboard/summary');
      expect(response.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Admin routes: comportamento ANTES vs DEPOIS da Fase 1
  //    ANTES: acesso sem token era permitido (bug)
  //    DEPOIS: exige JWT + ADMIN_GERAL
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: Rotas /admin/* agora exigem autenticação (regressão da Fase 1)', () => {
    it('GET /admin/health/quick-status sem token → 401 (era 200 antes da Fase 1)', async () => {
      const response = await testApp.request().get('/admin/health/quick-status');
      expect(response.status).toBe(401);
    });

    it('GET /admin/cache/status sem token → 401 (era 200 antes da Fase 1)', async () => {
      const response = await testApp.request().get('/admin/cache/status');
      expect(response.status).toBe(401);
    });

    it('GET /admin/security/score com ADMIN_GERAL → resposta estruturada (não 401/403)', async () => {
      const response = await testApp
        .request()
        .get('/admin/security/score')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);

      // Verifica estrutura da resposta quando chega no handler
      if (response.status === 200) {
        const body = response.body as {
          overall_score?: number;
          status?: string;
          components?: unknown[];
        };
        expect(typeof body.overall_score).toBe('number');
        expect(['secure', 'at_risk', 'vulnerable']).toContain(body.status);
        expect(Array.isArray(body.components)).toBe(true);
      }
    });

    it('GET /admin/security/validate-rls com ADMIN_GERAL → resposta estruturada', async () => {
      const response = await testApp
        .request()
        .get('/admin/security/validate-rls')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);

      if (response.status === 200) {
        const body = response.body as {
          status?: string;
          all_pass?: boolean;
          critical_tables?: unknown[];
          timestamp?: string;
        };
        expect(['secure', 'warning', 'vulnerable']).toContain(body.status);
        expect(typeof body.all_pass).toBe('boolean');
        expect(Array.isArray(body.critical_tables)).toBe(true);
        expect(typeof body.timestamp).toBe('string');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Cross-tenant isolation ainda funciona nos endpoints de negócio
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: Isolamento cross-tenant não regrediu', () => {
    it('Usuário do tenantA não pode ler /auth/me com token do tenantA apontando para tenantB', async () => {
      // Token do tenantA com x-company-id do tenantB → tenant context inválido
      const tenantB = testApp.getTenant('tenantB');

      const response = await testApp
        .request()
        .get('/auth/me')
        .set({
          Authorization: `Bearer ${adminEmpresaSession.accessToken}`,
          'x-company-id': tenantB.companyId,
        });

      // TenantGuard deve bloquear: o token é de tenantA mas está tentando usar contexto de tenantB
      // Deve ser 403 (tenant mismatch) ou 401/400 — nunca 200 com dados de tenantB
      const body = response.body as { user?: { company_id?: string } };
      if (response.status === 200) {
        // Se retornar 200, o company_id deve ser do tenantA, não tenantB
        expect(body.user?.company_id).not.toBe(tenantB.companyId);
      } else {
        expect([400, 401, 403]).toContain(response.status);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. RLS validation endpoint: teste cross-tenant com UUID inválido → 400
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: RLS isolation test — validação de UUID após Fase 1', () => {
    it('POST /admin/security/test-isolation com UUIDs inválidos → 400 (não executa query)', async () => {
      const response = await testApp
        .request()
        .post('/admin/security/test-isolation/nao-uuid/outro-nao-uuid')
        .set(testApp.authHeaders(adminGeralSession));

      expect(response.status).toBe(400);
    });

    it('POST /admin/security/test-isolation com UUIDs válidos → não 401/403', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tenantB = testApp.getTenant('tenantB');

      const response = await testApp
        .request()
        .post(`/admin/security/test-isolation/${tenantA.companyId}/${tenantB.companyId}`)
        .set(testApp.authHeaders(adminGeralSession));

      // Com UUIDs válidos, passa validação e executa teste de isolamento
      expect([401, 403]).not.toContain(response.status);

      // Resposta deve ter estrutura de resultado de isolamento
      if (response.status === 200) {
        const body = response.body as { status?: string; test_name?: string };
        expect(['secure', 'vulnerable']).toContain(body.status);
        expect(body.test_name).toBe('Cross-Tenant Data Isolation');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Smoke: health público ainda funciona (k8s probes não quebraram)
  // ────────────────────────────────────────────────────────────────────────────

  describe('Smoke: Health probes públicos (k8s)', () => {
    it('GET /health/ready → 200 (sem auth, rota pública)', async () => {
      const response = await testApp.request().get('/health/ready');
      expect(response.status).toBe(200);
    });

    it('GET /health/live → 200 (sem auth, rota pública)', async () => {
      const response = await testApp.request().get('/health/live');
      expect(response.status).toBe(200);
    });

    it('GET /health (completo) sem token → 401 (rota protegida)', async () => {
      const response = await testApp.request().get('/health');
      expect(response.status).toBe(401);
    });
  });
});
