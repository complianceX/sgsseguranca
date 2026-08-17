# Test Patterns — SGS Segurança

> Estratégia de testes, padrões, factories, mocks e configurações.

---

## Visão Geral

| Tier | Config | Padrão | Descoberta |
|------|--------|--------|-------------|
| **Unit** | `jest.config.js` | `*.spec.ts` | Junto ao source |
| **Smoke** | `jest-smoke.json` | `*.smoke-spec.ts` | Junto ao source |
| **E2E** | `jest-e2e.config.ts` | `*.e2e-spec.ts` | `test/` |
| **Load** | k6 scripts | `*.js` | `ops/test/load/` e `backend/test/load/` |

Frontend: `jest.config.cjs` com `next/jest` + jsdom. Nenhum teste implementado ainda.

---

## Comandos

```bash
# Backend
cd backend && npm run test            # Unit tests
cd backend && npm run test:watch      # TDD mode
cd backend && npm run test:clean      # Fresh run
cd backend && npm run test:e2e        # E2E tests
cd backend && npm run test:smoke      # Smoke tests
cd backend && npm run type-check      # tsc --noEmit
cd backend && npm run lint            # ESLint

# Frontend
cd frontend && npm run test:ci
cd frontend && npm run build
```

---

## Configuração (Backend Unit)

```js
// jest.config.js
{
  testMatch: ['**/src/**/*.(spec|smoke-spec).ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  maxWorkers: 1,
  clearMocks: true,
  restoreMocks: true,
  coverageThreshold: {
    statements: 49, functions: 40, branches: 40,
  },
  setupFiles: ['test/jest.setup.ts'],  // Muda log para mute
  moduleNameMapper: { '^uuid$': '<rootDir>/test/uuid-cjs.js' },  // ESM shim
}
```

---

## Configuração (Backend E2E)

```js
// test/jest-e2e.config.ts
{
  testMatch: [
    '**/test/critical/**/*.e2e-spec.ts',
    '**/test/aprs/**/*.e2e-spec.ts',
    '**/test/idor-security.e2e-spec.ts',
    '**/test/multi-tenancy.e2e-spec.ts',
  ],
  testTimeout: 60000,
  globalSetup: 'test/setup/e2e-infra-check.ts',  // Espera DB + Redis
  openHandlesTimeout: 10000,
}
```

Infra gating:
```ts
const describeE2E = process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;
```

---

## Pattern A — Unit Test (Service)

**Arquivo:** `src/**/*.service.spec.ts`

```ts
describe('ActivitiesService', () => {
  const createService = () => {
    const repository = {
      createQueryBuilder: jest.fn(() => ({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as Partial<Repository<Activity>>;

    const tenantService = { getTenantId: jest.fn().mockReturnValue('company-1') };
    const cacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const service = new ActivitiesService(
      repository as Repository<Activity>,
      tenantService as TenantService,
      cacheManager as never,
    );
    return { service, repository };
  };

  it('orders by created_at DESC', async () => {
    const { service, qb } = createService();
    await service.findPaginated({ page: 1, limit: 20 });
    expect(qb.orderBy).toHaveBeenCalledWith('activity.created_at', 'DESC');
  });
});
```

**Características:**
- Factory function com mocks manuais
- `as unknown as` para covariança de tipos
- Sem `Test.createTestingModule` — construtor puro
- Mocks frescos a cada teste

---

## Pattern B — Controller HTTP Test

**Arquivo:** `src/**/*.controller.spec.ts`

```ts
describe('ActivitiesController', () => {
  let app: INestApplication;
  const mockService = { findPaginated: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ActivitiesController],
      providers: [{ provide: ActivitiesService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  it('GET /activities → 200', async () => {
    mockService.findPaginated.mockResolvedValue({ data: [], total: 0 });
    await request(app.getHttpServer()).get('/activities').expect(200);
  });
});
```

**Características:**
- `Test.createTestingModule` com compilação única em `beforeAll`
- Todos os guards override com `{ canActivate: () => true }`
- Supertest para chamadas HTTP reais
- `useGlobalPipes` replica validação de produção

---

## Pattern C — Teste de Autorização Parametrizado

```ts
const ALL_ADMIN_ROUTES = [
  { method: 'get', path: '/admin/companies' },
  { method: 'post', path: '/admin/companies' },
];

describe('Role COLABORADOR → 403', () => {
  for (const { method, path } of ALL_ADMIN_ROUTES) {
    it(`${method.toUpperCase()} ${path} → 403`, async () => {
      const app = await buildApp(colaboradorGuard, rolesGuardFor(Role.COLABORADOR));
      const response = await request(app.getHttpServer())[method](path);
      expect(response.status).toBe(403);
    });
  }
});
```

Testa exaustivamente cada rota × cada role em um único suite.

---

## Pattern D — E2E Test

**Arquivo:** `test/**/*.e2e-spec.ts`

```ts
describeE2E('Multi-tenancy Isolation', () => {
  let testApp: TestApp;
  let sessionA: LoginSession;
  let sessionB: LoginSession;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();  // Drop + recreate + seed
    sessionA = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    sessionB = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantB');
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('bloqueia SELECT cross-tenant', async () => {
    const res = await testApp.request()
      .get(`/aprs/${aprFromTenantBId}`)
      .set(testApp.authHeaders(sessionA));
    expect(res.status).toBe(404);
  });
});
```

**Infra:**
- `TestApp.create()` — compila `AppModule`, inicializa NestJS real
- `resetDatabase()` — DROP SCHEMA + recreate + seed 2 tenants
- `loginAs(role, tenant)` — login real via `/auth/login`
- DB real: PostgreSQL em `127.0.0.1:5433`
- Redis real: `127.0.0.1:6379`

---

## Mock Strategies

| Layer | O que mockar | Como |
|-------|-------------|------|
| Services | Repository, TenantService, Cache | Factory com `jest.fn()` |
| Controllers | Services injetados | `useValue` no TestingModule |
| Guards | JwtAuthGuard, TenantGuard, RolesGuard | `.overrideGuard().useValue({ canActivate: () => true })` |
| Interceptors | TenantInterceptor, MetricInterceptor | `.overrideInterceptor().useValue({ intercept: () => next.handle() })` |
| E2E | Nada (tudo real) | DB + Redis reais, PasswordService com rounds=4 |

**Helpers disponíveis:**
```ts
TestHelper.mockRepository()  // { find, findOne, save, update, delete, create, findAndCount, count, remove }
TestHelper.mockUser()        // User entity shape
```

---

## Factories

| Factory | Tipo | Descrição |
|---------|------|-----------|
| `user.factory.ts` | DB | Cria User + Profile no banco |
| `training.factory.ts` | DB | Cria Training no banco |
| `apr.factory.ts` | HTTP | POST /aprs via supertest |
| `apr-test.factory.ts` | Helper | createTestApr(), createTestTenant(), createCreatorSession() |

---

## Multi-Tenant em Testes

**Unit:** `TenantService.getTenantId()` retorna `'company-1'` fixo.

**E2E:** 2 tenants seedados (A e B) com:
- Companies (CNPJs diferentes)
- Sites
- 4 usuários cada (admin_geral, admin_empresa, tst, trabalhador)

Testes verificam:
- Cross-tenant SELECT → 404
- Cross-tenant INSERT (spoof x-company-id) → 403
- Cross-tenant UPDATE/DELETE → 404
- Admin geral cross-tenant com audit trail
- UUID inválido → 400

---

## Load Tests (k6)

Os wrappers operacionais ficam em `ops/test/load/`; a implementação e os
fixtures específicos do backend ficam em `backend/test/load/`:

| Script | Perfil |
|--------|--------|
| `k6-enterprise-scale.js` | smoke → baseline → stress |
| `login-smoke.js` | Login: poucos usuários |
| `login-load.js` | Login: carga média |
| `login-soak.js` | Login: resistência |

```bash
npm run loadtest:smoke
npm run loadtest:baseline
npm run loadtest:stress
```

---

## Frontend Tests

Configuração:
```js
// jest.config.cjs (frontend)
{
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/context/(.*)$': '<rootDir>/src/state/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
}
```

**Setup polyfills:** `matchMedia`, `scrollTo`, `ResizeObserver`, `IntersectionObserver`, `PointerEvent`, `URL.createObjectURL`, `navigator.clipboard`, `TextEncoder`/`TextDecoder`.

Nenhum teste de frontend implementado ainda.

---

## Convenções

| Aspecto | Regra |
|---------|-------|
| Naming | `*.spec.ts` (unit), `*.e2e-spec.ts` (E2E), `*.smoke-spec.ts` (smoke) |
| Localização | Unit junto ao source. E2E em `test/` |
| Idioma | Mistura português e inglês nos `describe`/`it` |
| Reset | `clearMocks: true` + `restoreMocks: true` no config |
| Logger | Silenciado em unit tests |
| Timeout | Unit: 5s default. E2E: 60s |
| CSRF em E2E | Sempre chamar `testApp.csrfHeaders()` antes de mutações |
