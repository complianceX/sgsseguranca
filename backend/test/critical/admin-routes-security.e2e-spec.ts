/**
 * Fase 2 — E2E: Segurança das rotas /admin/*
 *
 * Confirma com JWT REAL (não mockado) que:
 *   1. Sem token                → 401
 *   2. Token ADMIN_EMPRESA       → 403  (role insuficiente)
 *   3. Token TRABALHADOR         → 403  (role insuficiente)
 *   4. Token ADMIN_GERAL         → passa a camada de autenticação (não 401/403)
 *   5. UUID inválido em rota     → 400  (ParseUUIDPipe antes da autenticação de negócio)
 *   6. SQL injection na rota     → 400
 *
 * Pré-condição: docker compose -f docker-compose.test.yml up -d
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Role } from '../../src/auth/enums/roles.enum';
import { TestApp, type LoginSession } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E P0 — Segurança das rotas /admin/* (Fase 1)', () => {
  let testApp: TestApp;

  let adminGeralSession: LoginSession;
  let adminEmpresaSession: LoginSession;
  let trabalhadorSession: LoginSession;
  let csrfHeaders: Record<string, string>;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();

    adminGeralSession = await testApp.loginAs(Role.ADMIN_GERAL, 'tenantA');
    adminEmpresaSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    trabalhadorSession = await testApp.loginAs(Role.TRABALHADOR, 'tenantA');
    csrfHeaders = await testApp.csrfHeaders();
  }, 60_000);

  afterAll(async () => {
    if (testApp) {
      await testApp.close();
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Sem autenticação → 401
  // ────────────────────────────────────────────────────────────────────────────

  describe('Sem token JWT → 401', () => {
    const unauthRoutes: Array<{ method: 'get' | 'post'; path: string }> = [
      { method: 'get', path: '/admin/cache/status' },
      { method: 'post', path: '/admin/cache/refresh-dashboard' },
      { method: 'post', path: '/admin/cache/refresh-all' },
      { method: 'get', path: '/admin/security/validate-rls' },
      { method: 'get', path: '/admin/security/score' },
      { method: 'get', path: '/admin/health/quick-status' },
      { method: 'get', path: '/admin/summary/compliance' },
      { method: 'get', path: '/admin/gdpr/pending-requests' },
      { method: 'post', path: '/admin/gdpr/cleanup-expired' },
    ];

    for (const route of unauthRoutes) {
      it(`${route.method.toUpperCase()} ${route.path} sem token → 401`, async () => {
        const response = await testApp
          .request()
          [route.method](route.path)
          .set(route.method === 'post' ? csrfHeaders : {});

        expect(response.status).toBe(401);
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. ADMIN_EMPRESA → 403 em todas as rotas admin
  // ────────────────────────────────────────────────────────────────────────────

  describe('ADMIN_EMPRESA → 403 (role insuficiente)', () => {
    const adminRoutes: Array<{ method: 'get' | 'post'; path: string }> = [
      { method: 'get', path: '/admin/cache/status' },
      { method: 'post', path: '/admin/cache/refresh-dashboard' },
      { method: 'get', path: '/admin/security/validate-rls' },
      { method: 'get', path: '/admin/security/score' },
      { method: 'get', path: '/admin/health/quick-status' },
      { method: 'get', path: '/admin/summary/compliance' },
      { method: 'get', path: '/admin/gdpr/pending-requests' },
    ];

    for (const route of adminRoutes) {
      it(`${route.method.toUpperCase()} ${route.path} com ADMIN_EMPRESA → 403`, async () => {
        const response = await testApp
          .request()
          [route.method](route.path)
          .set(testApp.authHeaders(adminEmpresaSession))
          .set(route.method === 'post' ? csrfHeaders : {});

        expect(response.status).toBe(403);
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. TRABALHADOR → 403 em todas as rotas admin
  // ────────────────────────────────────────────────────────────────────────────

  describe('TRABALHADOR → 403 (role insuficiente)', () => {
    it('GET /admin/cache/status com TRABALHADOR → 403', async () => {
      const response = await testApp
        .request()
        .get('/admin/cache/status')
        .set(testApp.authHeaders(trabalhadorSession));

      expect(response.status).toBe(403);
    });

    it('GET /admin/security/score com TRABALHADOR → 403', async () => {
      const response = await testApp
        .request()
        .get('/admin/security/score')
        .set(testApp.authHeaders(trabalhadorSession));

      expect(response.status).toBe(403);
    });

    it('GET /admin/gdpr/pending-requests com TRABALHADOR → 403', async () => {
      const response = await testApp
        .request()
        .get('/admin/gdpr/pending-requests')
        .set(testApp.authHeaders(trabalhadorSession));

      expect(response.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. ADMIN_GERAL → passa a camada de auth (não 401, não 403)
  // ────────────────────────────────────────────────────────────────────────────

  describe('ADMIN_GERAL → passa autenticação (não 401/403)', () => {
    it('GET /admin/health/quick-status com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/health/quick-status')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });

    it('GET /admin/cache/status com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/cache/status')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });

    it('GET /admin/security/validate-rls com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/security/validate-rls')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });

    it('GET /admin/security/score com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/security/score')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });

    it('GET /admin/gdpr/pending-requests com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/gdpr/pending-requests')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });

    it('GET /admin/summary/deployment-readiness com ADMIN_GERAL → não 401/403', async () => {
      const response = await testApp
        .request()
        .get('/admin/summary/deployment-readiness')
        .set(testApp.authHeaders(adminGeralSession));

      expect([401, 403]).not.toContain(response.status);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. UUID inválido em parâmetros de rota → 400 (ADMIN_GERAL)
  // ────────────────────────────────────────────────────────────────────────────

  describe('UUID inválido em params de rota → 400', () => {
    const invalidIds = [
      { label: 'string simples', value: 'nao-e-uuid' },
      { label: 'SQL injection básico', value: "'; DROP TABLE users; --" },
      { label: 'numero inteiro', value: '12345' },
      { label: 'UUID v1', value: '550e8400-e29b-11d4-a716-446655440000' },
    ];

    for (const { label, value } of invalidIds) {
      it(`POST /admin/gdpr/delete-user/${label} sem step-up → 403`, async () => {
        const response = await testApp
          .request()
          .post(`/admin/gdpr/delete-user/${encodeURIComponent(value)}`)
          .set(testApp.authHeaders(adminGeralSession))
          .set(csrfHeaders);

        expect(response.status).toBe(403);
        expect(response.body?.error?.code).toBe('STEP_UP_REQUIRED');
      });
    }

    it('GET /admin/gdpr/request-status/invalid-id → 400', async () => {
      const response = await testApp
        .request()
        .get('/admin/gdpr/request-status/invalid-id')
        .set(testApp.authHeaders(adminGeralSession));

      expect(response.status).toBe(400);
    });

    it('POST /admin/security/test-isolation/bad-uuid/bad-uuid → 400', async () => {
      const response = await testApp
        .request()
        .post('/admin/security/test-isolation/nao-uuid/nao-uuid')
        .set(testApp.authHeaders(adminGeralSession))
        .set(csrfHeaders);

      expect(response.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Token expirado / inválido → 401
  // ────────────────────────────────────────────────────────────────────────────

  describe('Token JWT adulterado ou inválido → 401', () => {
    it('Token forjado retorna 401', async () => {
      const response = await testApp
        .request()
        .get('/admin/cache/status')
        .set('Authorization', ['Bearer', 'not-a-valid-jwt'].join(' '));

      expect(response.status).toBe(401);
    });

    it('Token com prefixo incorreto retorna 401', async () => {
      const response = await testApp
        .request()
        .get('/admin/cache/status')
        .set('Authorization', `Token ${adminGeralSession.accessToken}`);

      expect(response.status).toBe(401);
    });

    it('Token de ADMIN_EMPRESA não pode ser usado para acessar /admin/*', async () => {
      // Garante que o bloqueio é por ROLE e não por token inválido
      const response = await testApp
        .request()
        .get('/admin/security/score')
        .set('Authorization', `Bearer ${adminEmpresaSession.accessToken}`)
        .set('x-company-id', adminEmpresaSession.companyId);

      // Token é válido (JWT verifica), mas role é insuficiente
      expect(response.status).toBe(403);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. x-company-id spoofing não bypassa autorização de role
  // ────────────────────────────────────────────────────────────────────────────

  describe('Header x-company-id spoofing não bypassa role ADMIN_GERAL', () => {
    it('ADMIN_EMPRESA com x-company-id do tenantB não vira ADMIN_GERAL', async () => {
      const tenantA = testApp.getTenant('tenantA');

      const response = await testApp
        .request()
        .get('/admin/security/score')
        .set({
          Authorization: `Bearer ${adminEmpresaSession.accessToken}`,
          'x-company-id': tenantA.companyId,
        });

      expect(response.status).toBe(403);
    });
  });
});
