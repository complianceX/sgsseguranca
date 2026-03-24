import { Role } from '../../src/auth/enums/roles.enum';
import { AprStatus } from '../../src/aprs/entities/apr.entity';
import { createApr } from '../factories/apr.factory';
import { TestApp, type LoginSession } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

// ---------------------------------------------------------------------------
// Referência: PROFILE_PERMISSION_FALLBACK (rbac.service.ts) + @Roles nos controllers
//
// Permissions relevantes por role:
//   ADMIN_GERAL   → can_create_apr, can_view_users, can_manage_users, can_manage_companies
//   ADMIN_EMPRESA → can_create_apr, can_view_users, can_manage_users  (sem can_manage_companies)
//   TST           → can_create_apr, can_view_users, can_manage_users
//   SUPERVISOR    → can_create_apr  (sem can_view_users / can_manage_users)
//   COLABORADOR   → can_create_apr  (sem can_view_users / can_manage_users)
//   TRABALHADOR   → (sem can_create_apr, sem can_view_users)
//
// @Roles guards por endpoint (independentes do RBAC):
//   POST /aprs           → ADMIN_GERAL | ADMIN_EMPRESA | TST | COLABORADOR
//   POST /aprs/:id/approve → ADMIN_GERAL | ADMIN_EMPRESA | TST | SUPERVISOR
//   POST /users          → ADMIN_GERAL | ADMIN_EMPRESA
//   GET  /users          → (sem @Roles — só @Authorize('can_view_users'))
// ---------------------------------------------------------------------------

type AprBody = { id?: string; status?: string };
type UserBody = { id?: string; nome?: string; profile_id?: string };
type PageBody<T = AprBody> = { data?: T[]; total?: number };

describeE2E('E2E Critical - Role permissions', () => {
  let testApp: TestApp;

  // Sessões dos 4 roles com usuário no seed
  let adminGeralSession: LoginSession;
  let adminEmpresaSession: LoginSession;
  let tstSession: LoginSession;
  let workerSession: LoginSession;

  // APR compartilhada para testes de approve
  let aprPendenteId: string;

  // ID do perfil ADMIN_GERAL — necessário para testes de privilege escalation
  let adminGeralProfileId: string;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();

    adminGeralSession = await testApp.loginAs(Role.ADMIN_GERAL, 'tenantA');
    adminEmpresaSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    tstSession = await testApp.loginAs(Role.TST, 'tenantA');
    workerSession = await testApp.loginAs(Role.TRABALHADOR, 'tenantA');

    // Busca o UUID do perfil ADMIN_GERAL para testes de privilege escalation
    const profiles = await testApp.dataSource.query(
      'SELECT id FROM profiles WHERE nome = $1 LIMIT 1',
      [Role.ADMIN_GERAL],
    ) as Array<{ id: string }>;
    adminGeralProfileId = profiles[0]?.id ?? '';

    // Cria APR em status Pendente para testes de approve
    const tenantA = testApp.getTenant('tenantA');
    const tst = testApp.getUser('tenantA', Role.TST);
    const apr = await createApr(testApp, tstSession, {
      numero: 'APR-PERM-BASE-001',
      titulo: 'APR Base para Testes de Permissão',
      siteId: tenantA.siteId,
      elaboradorId: tst.id,
    });
    aprPendenteId = apr.id;
  });

  afterAll(async () => {
    await testApp.close();
  });

  // =========================================================================
  // Grupo 1 — APR: permissão de criação (POST /aprs)
  //   @Roles: ADMIN_GERAL | ADMIN_EMPRESA | TST | COLABORADOR
  //   @Authorize: can_create_apr
  // =========================================================================
  describe('Grupo 1 — APR create: matriz de permissão por role', () => {
    it('1.1 TRABALHADOR → 403 (ausente em @Roles e sem can_create_apr)', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const res = await testApp
        .request()
        .post('/aprs')
        .set(testApp.authHeaders(workerSession))
        .send({
          numero: 'APR-WORKER-BLOCKED',
          titulo: 'APR Bloqueada',
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

    it('1.2 TST → 201 (em @Roles e tem can_create_apr)', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-TST-PERM-001',
        titulo: 'APR Criada por TST',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      expect(apr.id).toBeTruthy();
      expect(apr.status).toBe(AprStatus.PENDENTE);
    });

    it('1.3 ADMIN_EMPRESA → 201 (em @Roles e tem can_create_apr)', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, adminEmpresaSession, {
        numero: 'APR-ADMIN-PERM-001',
        titulo: 'APR Criada por Admin Empresa',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      expect(apr.id).toBeTruthy();
      expect(apr.status).toBe(AprStatus.PENDENTE);
    });

    it('1.4 ADMIN_GERAL → 201 (em @Roles e tem can_create_apr)', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, adminGeralSession, {
        numero: 'APR-ADMGERAL-PERM-001',
        titulo: 'APR Criada por Admin Geral',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      expect(apr.id).toBeTruthy();
      expect(apr.status).toBe(AprStatus.PENDENTE);
    });
  });

  // =========================================================================
  // Grupo 2 — APR: permissão de aprovação (POST /aprs/:id/approve)
  //   @Roles: ADMIN_GERAL | ADMIN_EMPRESA | TST | SUPERVISOR
  //   @Authorize: can_create_apr
  // =========================================================================
  describe('Grupo 2 — APR approve: matriz de permissão por role', () => {
    it('2.1 TRABALHADOR → 403 (ausente em @Roles e sem can_create_apr)', async () => {
      const res = await testApp
        .request()
        .post(`/aprs/${aprPendenteId}/approve`)
        .set(testApp.authHeaders(workerSession))
        .send({});

      expect(res.status).toBe(403);
    });

    it('2.2 TST → 201 (em @Roles para approve e tem can_create_apr)', async () => {
      // Cria APR exclusiva para este teste — aprPendenteId é compartilhado
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-APPROVE-TST-001',
        titulo: 'APR Para Approve por TST',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      const res = await testApp
        .request()
        .post(`/aprs/${apr.id}/approve`)
        .set(testApp.authHeaders(tstSession))
        .send({ reason: 'Aprovado pelo TST nos testes de permissão' });

      const body = res.body as AprBody;
      expect([200, 201]).toContain(res.status);
      expect(body.status).toBe(AprStatus.APROVADA);
    });

    it('2.3 ADMIN_EMPRESA → 201 (em @Roles para approve e tem can_create_apr)', async () => {
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-APPROVE-ADMIN-001',
        titulo: 'APR Para Approve por Admin Empresa',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });

      const res = await testApp
        .request()
        .post(`/aprs/${apr.id}/approve`)
        .set(testApp.authHeaders(adminEmpresaSession))
        .send({});

      const body = res.body as AprBody;
      expect([200, 201]).toContain(res.status);
      expect(body.status).toBe(AprStatus.APROVADA);
    });
  });

  // =========================================================================
  // Grupo 3 — Usuários: listagem (GET /users)
  //   @Authorize: can_view_users  (sem @Roles adicional)
  // =========================================================================
  describe('Grupo 3 — GET /users: can_view_users por role', () => {
    it('3.1 ADMIN_EMPRESA → 200 (tem can_view_users)', async () => {
      const res = await testApp
        .request()
        .get('/users?page=1&limit=10')
        .set(testApp.authHeaders(adminEmpresaSession));

      const body = res.body as PageBody<UserBody>;
      expect(res.status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('3.2 TST → 200 (tem can_view_users)', async () => {
      const res = await testApp
        .request()
        .get('/users?page=1&limit=10')
        .set(testApp.authHeaders(tstSession));

      const body = res.body as PageBody<UserBody>;
      expect(res.status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('3.3 TRABALHADOR → 403 (sem can_view_users)', async () => {
      const res = await testApp
        .request()
        .get('/users?page=1&limit=10')
        .set(testApp.authHeaders(workerSession));

      expect(res.status).toBe(403);
    });

    it('3.4 ADMIN_GERAL → 200 e vê todos os usuários do tenant', async () => {
      const res = await testApp
        .request()
        .get('/users?page=1&limit=100')
        .set(testApp.authHeaders(adminGeralSession));

      const body = res.body as PageBody<UserBody>;
      expect(res.status).toBe(200);
      expect(typeof body.total).toBe('number');
      expect((body.total ?? 0)).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Grupo 4 — Usuários: criação (POST /users) + privilege escalation
  //   @Roles: ADMIN_GERAL | ADMIN_EMPRESA
  //   @Authorize: can_manage_users
  //   UsersService: bloqueia perfil ADMIN_GERAL se !isSuperAdmin
  // =========================================================================
  describe('Grupo 4 — POST /users: privilege escalation e restrição de role', () => {
    it('4.1 TST não pode criar usuário → 403 (ausente em @Roles de POST /users)', async () => {
      // TST tem can_manage_users mas não está em @Roles → guard de roles bloqueia
      const res = await testApp
        .request()
        .post('/users')
        .set(testApp.authHeaders(tstSession))
        .send({
          nome: 'Usuário Teste TST',
          cpf: '71428793860',
          email: 'tst-create-attempt@e2e.test',
          password: 'Password@123',
          profile_id: adminGeralProfileId,
        });

      expect(res.status).toBe(403);
    });

    it('4.2 TRABALHADOR não pode criar usuário → 403 (ausente em @Roles e sem can_manage_users)', async () => {
      const res = await testApp
        .request()
        .post('/users')
        .set(testApp.authHeaders(workerSession))
        .send({
          nome: 'Usuário Teste Worker',
          cpf: '88641577947',
          email: 'worker-create-attempt@e2e.test',
          password: 'Password@123',
          profile_id: adminGeralProfileId,
        });

      expect(res.status).toBe(403);
    });

    it('4.3 ADMIN_EMPRESA tenta criar usuário com perfil ADMIN_GERAL → 403 (privilege escalation bloqueada)', async () => {
      // UsersService.create(): se profile.nome === 'Administrador Geral' && !isSuperAdmin → ForbiddenException
      // ADMIN_EMPRESA tem can_manage_users e está em @Roles, mas isSuperAdmin() === false
      const res = await testApp
        .request()
        .post('/users')
        .set(testApp.authHeaders(adminEmpresaSession))
        .send({
          nome: 'Tentativa Escalação',
          cpf: '14265637620',
          email: 'privilege-escalation@e2e.test',
          password: 'Password@123',
          profile_id: adminGeralProfileId,
        });

      expect(res.status).toBe(403);
    });

    it('4.4 ADMIN_EMPRESA cria usuário com perfil normal → 201 (sem escalação)', async () => {
      // Busca um perfil não-ADMIN_GERAL (TST) para criar o usuário normalmente
      const profiles = await testApp.dataSource.query(
        'SELECT id FROM profiles WHERE nome = $1 LIMIT 1',
        [Role.TST],
      ) as Array<{ id: string }>;
      const tstProfileId = profiles[0]?.id ?? '';

      const res = await testApp
        .request()
        .post('/users')
        .set(testApp.authHeaders(adminEmpresaSession))
        .send({
          nome: 'Novo TST Criado por Admin Empresa',
          cpf: '63825510070',
          email: 'new-tst-by-admin@e2e.test',
          password: 'Password@123',
          profile_id: tstProfileId,
        });

      const body = res.body as UserBody;
      expect(res.status).toBe(201);
      expect(body.id).toBeTruthy();
      expect(body.profile_id).toBe(tstProfileId);
    });

    it('4.5 ADMIN_GERAL cria usuário com perfil ADMIN_GERAL → 201 (isSuperAdmin permite)', async () => {
      // isSuperAdmin() === true quando profile.nome === 'Administrador Geral' no JWT
      // UsersService.create() não bloqueia para superAdmin
      const res = await testApp
        .request()
        .post('/users')
        .set(testApp.authHeaders(adminGeralSession))
        .send({
          nome: 'Novo Admin Geral Criado por SuperAdmin',
          cpf: '95663729053',
          email: 'new-admin-geral@e2e.test',
          password: 'Password@123',
          profile_id: adminGeralProfileId,
        });

      const body = res.body as UserBody;
      expect(res.status).toBe(201);
      expect(body.id).toBeTruthy();
      expect(body.profile_id).toBe(adminGeralProfileId);
    });
  });

  // =========================================================================
  // Grupo 5 — Cross-tenant: isolamento deve retornar 404, não 403
  //
  // 404 é o comportamento correto: a API não deve confirmar a existência
  // do recurso para atores de outros tenants (security by obscurity).
  // 403 revelaria que o recurso existe mas o acesso é negado.
  // =========================================================================
  describe('Grupo 5 — Cross-tenant: isolamento retorna 404, não 403', () => {
    let aprTenantAId: string;
    let adminSessionB: LoginSession;

    beforeAll(async () => {
      // Cria APR no tenant A para tentar acessar do tenant B
      const tenantA = testApp.getTenant('tenantA');
      const tst = testApp.getUser('tenantA', Role.TST);

      const apr = await createApr(testApp, tstSession, {
        numero: 'APR-CROSS-TENANT-001',
        titulo: 'APR Cross-tenant Test',
        siteId: tenantA.siteId,
        elaboradorId: tst.id,
      });
      aprTenantAId = apr.id;

      adminSessionB = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantB');
    });

    it('5.1 GET /aprs/:id do tenant A pelo tenant B → 404 (não 403)', async () => {
      const res = await testApp
        .request()
        .get(`/aprs/${aprTenantAId}`)
        .set(testApp.authHeaders(adminSessionB));

      expect(res.status).toBe(404);
    });

    it('5.2 POST /aprs/:id/approve do tenant A pelo tenant B → 404 (não 403)', async () => {
      // Garante que a informação de existência não vaza nem em operações de escrita
      const res = await testApp
        .request()
        .post(`/aprs/${aprTenantAId}/approve`)
        .set(testApp.authHeaders(adminSessionB))
        .send({});

      expect(res.status).toBe(404);
    });

    it('5.3 GET /aprs (listagem) do tenant B não contém APRs do tenant A', async () => {
      const res = await testApp
        .request()
        .get('/aprs?page=1&limit=100')
        .set(testApp.authHeaders(adminSessionB));

      const body = res.body as PageBody;
      const items = Array.isArray(body.data) ? body.data : [];

      expect(res.status).toBe(200);
      expect(items.some((item) => item.id === aprTenantAId)).toBe(false);
    });

    it('5.4 GET /users (listagem) do tenant B não retorna usuários do tenant A', async () => {
      const tenantAAdminId = adminEmpresaSession.userId;

      const res = await testApp
        .request()
        .get('/users?page=1&limit=100')
        .set(testApp.authHeaders(adminSessionB));

      const body = res.body as PageBody<UserBody>;
      const items = Array.isArray(body.data) ? body.data : [];

      expect(res.status).toBe(200);
      expect(items.some((item) => item.id === tenantAAdminId)).toBe(false);
    });

    it('5.5 GET /users/:id do tenant A pelo tenant B → 404 (não 403)', async () => {
      const tenantAAdminId = adminEmpresaSession.userId;

      const res = await testApp
        .request()
        .get(`/users/${tenantAAdminId}`)
        .set(testApp.authHeaders(adminSessionB));

      expect(res.status).toBe(404);
    });
  });
});
