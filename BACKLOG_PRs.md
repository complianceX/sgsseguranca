# 📋 BACKLOG DE PRS - Todas as 10 PRs Explained

**Roadmap:** 4 Semanas | **Total:** 10 PRs | **Status:** ✅ Ready

---

## 📌 VISÃO GERAL

Cada PR é **uma** feature/melhoria bem definida:
- Tempo estimado: 4-16 horas
- Dependências: Documentadas
- Acceptance criteria: Claras
- Rollback: Documentado

**Total de Work:** ~160 horas (4 semanas, 1 dev)

---

## 📅 SEMANA 1 - CRÍTICO (Vulnerabilities & Performance)

### ✅ PR #1: NestJS Framework Upgrade (CVE Fix)
**Status:** 60% PRONTO** (npm audit fix feito, testes pendentes)

**Objetivo:** Remover 14 CVEs (path-to-regexp, lodash, etc)

**O que muda:**
- ✅ Upgrade `@nestjs/` 11.0.x → latest compatible
- ✅ Upgrade `lodash` → latest (fixes prototype pollution)
- ✅ Upgrade `@xmldom/xmldom` → latest (fixes XXE)
- ✅ Run full test suite + load test

**Arquivos Modificados:**
- `package.json` (lock file será regenerado)
- `package-lock.json`
- Nenhum source code alterado

**Validação:**
```bash
npm audit --omit=dev          # → 0 vulnerabilities
npm test                      # → All tests pass
npm run test:e2e             # → All e2e tests pass
k6 run test/load/k6-load-test.js  # → P95 < 1s
```

**Acceptance Criteria:**
- ✅ npm audit returns 0 CVEs
- ✅ All tests pass
- ✅ Load test P95 < 1s
- ✅ No performance regression
- ✅ Staging 48h green

**Tempo:** 4 horas  
**Risco:** BAIXO (upgrades são backward-compatible)  
**Rollback:** `npm install --legacy-peer-deps` (volta para versão anterior)

**Blockers:** Nenhum (ready now!)  
**Depends on:** Nada (independente)

---

### PR #2: Database Indices Audit & Optimization
**Status:** 0% (not started, mas SQL pronto)

**Objetivo:** Auditar e otimizar índices (impact: P95 50% faster)

**O que muda:**
- ✅ Análise de índices via `validate-indexes.sql`
- ✅ Remover índices não utilizados
- ✅ Otimizar índices lentos (rebuld se necessário)
- ✅ VACUUM + ANALYZE para stats

**Arquivos:**
- `backend/scripts/validate-indexes.sql` (leia todos os 9 queries)
- `backend/scripts/optimize-database.sql` (execute com cuidado)

**SQL Executado:**
```sql
-- 1. Analisar índices
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;

-- 2. Remover não usados
DROP INDEX IF EXISTS idx_unused_index_name;

-- 3. Rebuild lentos
REINDEX INDEX idx_slow_index_name;

-- 4. Atualizar stats
ANALYZE table_name;
```

**Validação:**
```bash
# Antes:
SELECT p95_latency FROM k6_results WHERE route = '/dashboard';  # ~800ms

# Depois:
k6 run test/load/k6-load-test.js  # → P95 < 300ms ✅
```

**Acceptance Criteria:**
- ✅ Indices validated via script
- ✅ Non-used indices identified + removed
- ✅ P95 latency reduced > 30%
- ✅ Database size analyzed
- ✅ Backup taken before changes

**Tempo:** 6 horas  
**Risco:** MEIO (reindex requer lock curto)  
**Rollback:** Restore backup  

**Schedule:** Preferencialmente FORA de horário de pico (ex: 22:00-23:00)

**Depends on:** PR #1 (após testes)

---

### PR #3: Backup & Disaster Recovery Validation
**Status:** 0% (documentation + manual tests)

**Objetivo:** Validar que backups funcionam e DR procedure está documenter

**O que muda:**
- ✅ Test backup restore (não-destrutivo)
- ✅ Document DR procedure
- ✅ Validate replication (se aplicável)
- ✅ Set up automated backup validation

**Arquivos Modified/Created:**
- `BACKUP_STRATEGY.md` (atualizar com validação)
- `DR_BACKUP_VALIDATION.md` (ja existe, validar)
- `scripts/test-backup-restore.sh` (criar)

**Testes:**
```bash
# Teste 1: Backup
pg_dump -Fc prod_db > test_backup.dump

# Teste 2: Restore em DB temp
psql test_db < test_backup.dump

# Teste 3: Data integrity check
SELECT COUNT(*) FROM users;  # → Mesmo que produção
```

**Acceptance Criteria:**
- ✅ Backup/restore tested
- ✅ Data integrity verified
- ✅ RTO/RPO documented
- ✅ Runbook ready
- ✅ Team trained

**Tempo:** 4 horas  
**Risco:** BAIXO (não toca produção se cuidadoso)  
**Rollback:** N/A (testing only)

**Depends on:** PR #1

---

---

## 📅 SEMANA 2 - SEGURANÇA (Security Features)

### PR #4: Resilient Rate Limiting
**Status:** 0% (código 95% pronto, integração pendente)

**Objetivo:** Implementar rate limiting com fail-closed strategy

**Arquivo:** `backend/src/common/throttler/resilient-throttler.service.ts` ✅

**O que muda:**
- ✅ Adicionar `ResilientThrottlerService` ao `app.module.ts`
- ✅ Adicionar `ResilientThrottlerInterceptor` nos routes críticas
- ✅ Configurar tiers de rate limit (AUTH, PUBLIC, API, DASHBOARD)
- ✅ Testar fail-closed (Redis offline = bloqueia)

**Environment Variables:**
```bash
THROTTLER_ENABLED=true
THROTTLER_FAIL_CLOSED=true
THROTTLER_AUTH_LIMIT=5           # per minute
THROTTLER_PUBLIC_LIMIT=10
THROTTLER_API_LIMIT=100
THROTTLER_DASHBOARD_LIMIT=50
```

**Implementação em `app.module.ts`:**
```typescript
import { ResilientThrottlerService } from './common/throttler/resilient-throttler.service';

@Module({
  providers: [ResilientThrottlerService],
})
export class AppModule {}
```

**Nos Controladores:**
```typescript
import { ResilientThrottlerInterceptor } from './common/throttler/resilient-throttler.interceptor';

@Controller('auth')
@UseInterceptors(ResilientThrottlerInterceptor)
export class AuthController {
  // Routes aqui serão rate-limited automaticamente
}
```

**Testes:**
```bash
# Test 1: Normal rate limit
for i in {1..6}; do
  curl http://localhost:3000/auth/login
done
# Esperado: 6º request retorna 429 (Too Many Requests)

# Test 2: Redis offline (mock)
redis-cli SHUTDOWN    # Simula Redis failing
curl http://localhost:3000/auth/login
# Esperado: 429 com fail-closed (bloqueia)

# Test 3: Dashboard (degradado, não bloqueia)
curl http://localhost:3000/dashboard/metrics
# Esperado: 200 (in-memory fallback)
```

**Acceptance Criteria:**
- ✅ Rate limiting active
- ✅ 429 responses on limit breach
- ✅ Fail-closed on critical routes (AUTH, PUBLIC_VALIDATE)
- ✅ Fail-open on non-critical routes (DASHBOARD)
- ✅ Monitoring alerts configured
- ✅ Performance: <5ms overhead

**Tempo:** 6 horas  
**Risco:** MÉDIO (pode bloquear tráfego legítimo se mal configurado)  
**Rollback:** Remover interceptor, desabilitar com `THROTTLER_ENABLED=false`

**Depends on:** PR #1 ✅ (testes passando)

---

### PR #5: CSRF Token Protection
**Status:** 0% (código 95% pronto, integração pendente)

**Objetivo:** Implementar CSRF protection com token binding

**Arquivo:** `backend/src/auth/csrf-protection.service.ts` ✅

**O que muda:**
- ✅ Adicionar `CsrfProtectionService` ao `app.module.ts`
- ✅ Adicionar `CsrfProtectionGuard` nas rotas vulneráveis (forms, POST/PUT/DELETE)
- ✅ Gerar tokens HMAC-SHA256 com session binding
- ✅ Suporte a report-only mode (para rollout gradual)

**Environment Variables:**
```bash
REFRESH_CSRF_ENFORCED=true        # Enforce ou report-only
REFRESH_CSRF_SECRET=your_secret   # Para HMAC
REFRESH_CSRF_COOKIE_SECURE=true   # HTTPS only
```

**Implementação:**
```typescript
import { CsrfProtectionGuard } from './auth/csrf-protection.guard';

@Controller('forms')
@UseGuards(CsrfProtectionGuard)
export class FormController {
  @Post('submit')
  submit() { /* ... */ }
}
```

**No Frontend (exemplo):**
```html
<!-- Pedir token ao backend -->
<script>
  fetch('/auth/csrf-token')
    .then(r => r.json())
    .then(d => {
      document.getElementById('csrf_token').value = d.token;
    });
</script>

<!-- Incluir no form -->
<form method="POST" action="/forms/submit">
  <input type="hidden" name="_csrf" id="csrf_token" />
  <input type="submit" />
</form>
```

**Testes:**
```bash
# Test 1: Sem token (esperado: 403)
curl -X POST http://localhost:3000/forms/submit
# → 403 Forbidden

# Test 2: Com token válido
TOKEN=$(curl http://localhost:3000/auth/csrf-token | jq .token)
curl -X POST http://localhost:3000/forms/submit \
  -H "X-CSRF-Token: $TOKEN"
# → 200 OK

# Test 3: Report-only mode
REFRESH_CSRF_ENFORCED=false npm start
# → Log de violações but sem bloquear
```

**Acceptance Criteria:**
- ✅ CSRF tokens generated
- ✅ Session binding verified
- ✅ Report-only mode works
- ✅ Tokens rotate correctly
- ✅ Performance: <2ms overhead
- ✅ 100% coverage on POST/PUT/DELETE

**Tempo:** 5 horas  
**Risco:** MÉDIO (pode quebrar forms se não tested)  
**Rollback:** `REFRESH_CSRF_ENFORCED=false`

**Depends on:** PR #1

---

### PR #6: Dashboard Cache Implementation
**Status:** ⚠️ **STUBS NEED FIX** (implementar em 03/04)

**Objetivo:** Cache de dashboard com Redis (CACHE-ASIDE pattern)

**Arquivo:** `backend/src/common/cache/dashboard-cache.service.ts` ⚠️

**Problema HOJE:** Funções `computeMetrics()` e `fetchLatestActivities()` são stubs  
**Fix:** 03/04 (amanhã) - ver [ACAO_RESOLVER_BLOCKERS_03-04.md](ACAO_RESOLVER_BLOCKERS_03-04.md)

**O que muda (após fix):**
- ✅ Cache dashboard metrics em Redis (TTL 5 min)
- ✅ Cache activities feed (TTL 1 min)
- ✅ Cache summaries (TTL 1 hora)
- ✅ Invalidação automática (pattern matching)
- ✅ Fallback se Redis offline

**Environment Variables:**
```bash
DASHBOARD_CACHE_ENABLED=true
DASHBOARD_CACHE_TTL_METRICS=300    # 5 min
DASHBOARD_CACHE_TTL_ACTIVITIES=60  # 1 min
DASHBOARD_CACHE_TTL_SUMMARIES=3600 # 1 hour
```

**Integração:**
```typescript
import { DashboardCacheService } from './common/cache/dashboard-cache.service';

@Injectable()
export class DashboardService {
  constructor(private cache: DashboardCacheService) {}

  async getMetrics(companyId: string) {
    // Tenta cache primeiro
    return this.cache.getDashboardMetrics(companyId, 'month');
  }
}
```

**Performance Expected:**
- Sem cache: P95 500ms (queries complexas)
- Com cache: P95 50ms (cache hit) → **90% redução!**

**Testes:**
```bash
# Test 1: Cache hit
curl http://localhost:3000/dashboard/metrics
# → 50ms ✅

# Test 2: Cache expire
sleep 310  # 5 min + buffer
curl http://localhost:3000/dashboard/metrics
# → Query executada novamente (fresh data)

# Test 3: Invalidation
curl -X POST http://localhost:3000/dashboard/invalidate
curl http://localhost:3000/dashboard/metrics
# → Fresh query ✅
```

**Acceptance Criteria:**
- ✅ Stubs implementados com queries reais (03/04)
- ✅ Cache hit rate > 80%
- ✅ TTL expiration working
- ✅ Invalidation pattern working
- ✅ Fallback sem Redis funciona
- ✅ P95 latência < 100ms com cache

**Tempo:** 4 horas (já feito 95%, só stubs)  
**Risco:** BAIXO (degradation apenas, não quebra)  
**Rollback:** `DASHBOARD_CACHE_ENABLED=false`

**Depends on:** PR #1 + PR #4 (após validação)

---

### PR #7: N+1 Query Detection
**Status:** 0% (código 100% pronto, integração pendente)

**Objetivo:** Desenvolvimento tool para detectar N+1 patterns

**Arquivo:** `backend/src/common/database/n1-query-detector.service.ts` ✅

**O que muda:**
- ✅ Adicionar `N1QueryDetectorService` ao `app.module.ts` (dev-only)
- ✅ Investigar queries repetidas em testes
- ✅ Otimizar queries identificadas
- ✅ DESABILITAR em produção (log noise)

**Environment Variables:**
```bash
N1_QUERY_DETECTION_ENABLED=true   # Dev only!
N1_QUERY_THRESHOLD=3               # Alerta após 3x repetição
N1_SLOW_QUERY_THRESHOLD=100        # Alerta se > 100ms
```

**Implementação:**
```typescript
import { N1QueryDetectorService } from './common/database/n1-query-detector.service';

@Module({
  providers: [N1QueryDetectorService],
})
export class AppModule {}

// No seu test:
describe('APR Service', () => {
  it('should not have N+1 with large dataset', async () => {
    const service = app.get(N1QueryDetectorService);
    service.enable();

    const result = await aprService.findAll();  // Roda queries

    const report = service.generateReport();
    expect(report.suspects).toHaveLength(0);  // Zero N+1s!
  });
});
```

**Exemplo de Bug Detectado:**
```typescript
// ❌ BAD: N+1 pattern
const aprList = await aprRepository.find();  // Query 1
for (const apr of aprList) {
  apr.activities = await actRepository.find({where: {aprId: apr.id}});  // N queries
}

// ✅ GOOD: Otimizado
const aprList = await aprRepository.find({
  leftJoinAndSelect: 'apr.activities'  // 1 query só!
});
```

**Testes:**
```bash
npm run test -- n1-query-detector.spec.ts
# Deverá reportar queries repetidas
```

**Acceptance Criteria:**
- ✅ Service integrado
- ✅ Dev mode only (não afeta produção)
- ✅ Detecta padrões N+1
- ✅ Report gerado
- ✅ 0 false positives
- ✅ < 5ms overhead

**Tempo:** 3 horas  
**Risco:** BAIXO (dev-only, read-only)  
**Rollback:** Remover provider, desabilitar

**Depends on:** Nada (independente)

---

---

## 📅 SEMANA 3-4 - DATABASE OPTIMIZATION

### PR #8: Index Health & Performance Monitor
**Status:** 0% (SQL pronto, monitoring setup)

**Objetivo:** Criar dashboard de saúde de índices + alerts

**O que muda:**
- ✅ Setup query de monitoramento
- ✅ Integrar com New Relic / Prometheus
- ✅ Alert em índices degradados
- ✅ Schedule REINDEX automático

**Script:** `backend/scripts/validate-indexes.sql`

**Monitoramento:**
```sql
-- Query contínua
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  CASE 
    WHEN idx_scan = 0 THEN 'NUNCA USADO'
    WHEN idx_tup_fetch / NULLIF(idx_tup_read, 0) < 0.1 THEN 'INEFICIENTE'
    ELSE 'OK'
  END as status
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

**Alert Conditions:**
- Alert se índice nunca usado (idx_scan = 0) por > 7 dias
- Alert se index bloat > 50%
- Alert se index size > 10% da tabela

**Tempo:** 5 horas  
**Risco:** BAIXO (monitoring only)

---

### PR #9: Read Replica Setup (Advanced)
**Status:** 0% (SQL documentado, setup opcional)

**Objetivo:** Setup PostgreSQL streaming replication para read scaling

**Arquivo:** `backend/scripts/setup-read-replica.sql`

**O que muda:**
- ✅ Configure PRIMARY server (master)
- ✅ Setup REPLICA servers (standby)
- ✅ Configure WAL streaming
- ✅ Update TypeORM config para read/write split
- ✅ Test failover

**No TypeORM:**
```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Master (writes)
      host: 'db-master.internal',
      port: 5432,
      username: 'postgres',
      password: process.env.DB_PASSWORD,
      database: 'seguraca',
      
      // Slaves (reads)
      replication: {
        read: [
          {
            host: 'db-replica-1.internal',
            port: 5432,
            username: 'postgres_read',
            password: process.env.DB_PASSWORD,
          },
          {
            host: 'db-replica-2.internal',
            port: 5432,
            username: 'postgres_read',
            password: process.env.DB_PASSWORD,
          }
        ]
      }
    })
  ]
})
export class DatabaseModule {}
```

**Expected Benefit:**
- Read queries distributed across replicas
- Write capacity unchanged (master bottleneck)
- High availability (automatic failover)

**Tempo:** 8 horas  
**Risco:** ALTO (架构 change, complex setup)  
**Schedule:** Week 4 (após todas outras validações)

**Prerequisites:**
- Extra hardware (2x replicas)
- DBA consultation
- Network configuration
- Failover tooling (patroni, etcd)

---

### PR #10: FINAL: Production Deployment Readiness
**Status:** 0% (checklists + final validation)

**Objetivo:** Validação final antes GO-LIVE

**O que valida:**
- ✅ Todos testes passando
- ✅ Load test P95 < 200ms
- ✅ Zero CVEs
- ✅ Backup validado
- ✅ Rollback procedure testado
- ✅ Monitoring alerts active
- ✅ Team trained
- ✅ Documentation updated

**Checklist Pré-Produção:**
```bash
# Code
npm audit --omit=dev          # → 0 CVEs
npm run type-check            # → ✅
npm run lint                  # → ✅
npm test                      # → ✅
npm run test:e2e             # → ✅

# Performance
k6 run test/load/k6-load-test.js --vus 100 --duration 5m
# → P95 < 200ms ✅
# → Error rate < 0.5% ✅

# Database
psql -f backend/scripts/validate-indexes.sql
# → All indices healthy ✅

# Monitoring
curl http://monitor:3000/health
# → All checks green ✅

# Backup
pg_dump -Fc prod_db > pre_release_backup.dump
# → Size realistic, restore tested ✅
```

**Sign-off Required:**
- [ ] Dev Lead
- [ ] QA Lead
- [ ] DevOps/SRE Lead
- [ ] CTO (final approval)

**Tempo:** 4 horas  
**Risco:** CRÍTICO (se tudo não passar, delay release)

**Depends on:** PR #1-9 ✅ (todos em staging green)

---

---

## 📊 SUMMARY TABLE

| PR | Nome | Semana | Tempo | Status | Risco | PRE-REQ |
|---|---|---|---|---|---|---|
| #1 | NestJS Upgrade | 1 | 4h | 60% | BAIXO | - |
| #2 | DB Indices | 1 | 6h | 0% | MÉDIO | #1 ✅ |
| #3 | Backup Validation | 1 | 4h | 0% | BAIXO | #1 ✅ |
| #4 | Rate Limiting | 2 | 6h | 95% | MÉDIO | #1 ✅ |
| #5 | CSRF Protection | 2 | 5h | 95% | MÉDIO | #1 ✅ |
| #6 | Dashboard Cache | 2 | 4h | ⚠️ 95%* | BAIXO | #1 ✅ |
| #7 | N+1 Detection | 2 | 3h | 100% | BAIXO | - |
| #8 | Index Monitor | 3 | 5h | 0% | BAIXO | #2 ✅ |
| #9 | Read Replica | 4 | 8h | 0% | ALTO | #2 ✅ |
| #10 | Go-Live Ready | 4 | 4h | 0% | CRÍTICO | #1-9 ✅ |
| | | | **160h** | | | |

*\*Stubs precisam ser implementados em 03/04*

---

## 🚀 WORKFLOW GIT SUGERIDO

```bash
# 1. Criar feature branch por PR
git checkout -b improve/nestjs-upgrade
# Implementar...
git add .
git commit -m "feat(core): upgrade NestJS to latest secure version (#1)"
git push origin improve/nestjs-upgrade

# 2. Criar PR no GitHub
# → Pedir review
# → 2+ approvals antes de merge

# 3. Merge para staging
git checkout staging
git pull origin staging
git merge improve/nestjs-upgrade
git push origin staging

# 4. Deploy staging + 48h testing
# → Se green, merge para main
# → Tag release versioning

# 5. Deploy para production
git checkout main
git pull origin main
git tag -a v2.0.0 -m "Database Optimization Release"
git push origin --tags
```

---

## 📞 WEEKLY PROGRESS TEMPLATE

**Semana 1 Status:**
- [ ] PR #1 (NestJS): 50% → testes rodando
- [ ] PR #2 (Indices): 20% → análise completa
- [ ] PR #3 (Backup): 10% → planning
- **Total:** 25% (40h/160h)

**Semana 2 Status:**
- [ ] PR #4 (Rate Limiting): 100% → staging green
- [ ] PR #5 (CSRF): 100% → staging green
- [ ] PR #6 (Cache): 100% → staging green (após fix em 03/04)
- [ ] PR #7 (N+1): 100% → staging green
- **Total:** 65% (104h/160h)

**Semana 3 Status:**
- [ ] PR #8 (Index Monitor): 90% → ready
- [ ] PR #2 (Indices): 100% → production
- **Total:** 80% (128h/160h)

**Semana 4 Status:**
- [ ] PR #9 (Replica): 80% → optional
- [ ] PR #10 (Go-Live): 100% → release! 🚀
- **Total:** 100% (160h/160h)

---

**Criado:** 02/04/2026  
**Próxima revisão:** 07/04/2026 (fim semana 1)

Boa sorte! 💪
