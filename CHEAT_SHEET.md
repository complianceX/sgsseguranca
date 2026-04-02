# ⚡ CHEAT SHEET - Comandos Rápidos

**Guia rápido com todos os comandos necessários para as próximas 4 semanas**

---

## 🚀 HOJE (02/04) - Quick Start

```bash
# Ler documentação (você está aqui!)
cat SUMARIO_EXECUTIVO.md
cat REVIEW_DOCUMENTACAO_2026.md
cat DASHBOARD_REVIEW.txt

# Verificar status anterior
npm audit --omit=dev
# Esperado: up to date, 0 vulnerabilities ✅
```

---

## 🔧 AMANHÃ (03/04) - Fix Blocker

```bash
# 1. Abrir o arquivo que precisa fix
code backend/src/common/cache/dashboard-cache.service.ts

# 2. Procurar função stub
grep -n "computeMetrics\|fetchLatestActivities" backend/src/common/cache/dashboard-cache.service.ts

# 3. Implementar (seguir ACAO_RESOLVER_BLOCKERS_03-04.md)
# ... editar arquivo ...

# 4. Validar
npm run type-check
# Esperado: ✅ No errors

npm run lint
# Esperado: ✅ No errors

npm test -- dashboard-cache.service.spec.ts
# Esperado: ✅ All tests pass

# 5. Test localmente
npm run start:dev &
sleep 5
curl http://localhost:3000/dashboard/metrics
# Esperado: 200 OK com dados válidos

# 6. Commit
git add .
git commit -m "fix(cache): implement dashboard-cache stubs with real queries"
git push origin improve/dashboard-optimization
```

---

## 📅 SEMANA 1 (07/04) - Week 1 Crunch

### PR #1: NestJS Upgrade (já 60% pronto!)

```bash
# 1. Verificar antes
npm audit --omit=dev
# Esperado: 14 vulnerabilities (ou menos se você já fez parte)

# 2. Upgrade
npm audit fix --force --legacy-peer-deps
# Vai mudar package.json e package-lock.json

# 3. Limpar install
npm ci --legacy-peer-deps
# Esperado: exit code 0 ✅

# 4. Full test suite
npm test
# Esperado: ✅ All tests pass

npm run test:e2e
# Esperado: ✅ All e2e tests pass

# 5. Load test
k6 run test/load/k6-load-test.js
# Esperado: P95 < 1000ms

# 6. Build
npm run build
# Esperado: ✅ Build succeeds

# 7. Local smoke test
npm run start:dev &
sleep 10
curl http://localhost:3000/health
# Esperado: 200 OK

# 8. Commit + push
git add package*.json
git commit -m "chore(deps): upgrade NestJS and dependencies, resolve 14 CVEs"
git push origin feature/nestjs-upgrade
```

### PR #2: Database Indices

```bash
# 1. Analisar índices atuais
psql -U postgres -d seguraca \
  -f backend/scripts/validate-indexes.sql

# Esperado: Relatório mostrando índices bons, ruins, não usados

# 2. Tomar backup ANTES de fazer mudanças
pg_dump -Fc -U postgres seguraca > backup_pre_index_optimization.dump
# → Guardado em local seguro!

# 3. Remover índices não usados (do relatório acima)
psql -U postgres -d seguraca << EOF
DROP INDEX IF EXISTS idx_unused_index_1;
DROP INDEX IF EXISTS idx_unused_index_2;
-- etc...
EOF

# 4. Rebuild lentos
psql -U postgres -d seguraca << EOF
REINDEX INDEX idx_slow_index;
ANALYZE table_name;
EOF

# 5. Validar performance
k6 run test/load/k6-load-test.js
# Esperado: P95 <<< 800ms (target <300ms)

# 6. Commit
git add backend/scripts/
git commit -m "perf(db): optimize indices, 50% latency improvement"
git push origin feature/db-indices
```

### PR #3: Backup & Disaster Recovery

```bash
# 1. Fazer backup
pg_dump -Fc -U postgres seguraca > test_backup_$(date +%Y%m%d).dump

# 2. Restaurar em banco TEST (não produção!)
createdb test_seguraca_restore
pg_restore -U postgres -d test_seguraca_restore test_backup_$(date +%Y%m%d).dump

# 3. Validar integridade
psql -U postgres -d test_seguraca_restore << EOF
SELECT COUNT(*) as users_count FROM users;
SELECT COUNT(*) as aprs_count FROM aprs;
SELECT COUNT(*) as audits_count FROM audits;
-- Comparar com produção!
EOF

# 4. Atualizar documentação
cat > DR_PROCEDURE.md << EOF
# Disaster Recovery Procedure

## 1. Restore Database
pg_restore -Fc -U postgres -d seguraca backup_file.dump

## 2. Validate
psql -d seguraca -c "SELECT COUNT(*) FROM users;"

## 3. Restart App
systemctl restart api
EOF

# 5. Commit
git add DR_PROCEDURE.md
git commit -m "docs(disaster-recovery): validate backup/restore procedure"
git push origin feature/backup-validation
```

---

## 🔒 SEMANA 2 (14/04) - Security Sprint

### PR #4: Rate Limiting

```bash
# 1. Integrar service
code backend/src/app.module.ts
# Adicionar: 
# import { ResilientThrottlerService } from './common/throttler/resilient-throttler.service';
# providers: [ResilientThrottlerService]

# 2. Integrar interceptor
code backend/src/auth/auth.controller.ts
# Adicionar:
# @UseInterceptors(ResilientThrottlerInterceptor)

# 3. Configurar env vars
echo "THROTTLER_ENABLED=true" >> .env.example
echo "THROTTLER_FAIL_CLOSED=true" >> .env.example
echo "THROTTLER_AUTH_LIMIT=5" >> .env.example

# 4. Testar rate limiting
npm run start:dev &
sleep 5

# Teste 1: Normal requests ok
for i in {1..5}; do
  curl -v http://localhost:3000/auth/login 2>&1 | grep "< HTTP"
done
# Esperado: 5x "200 OK" ou "401 Unauthorized" (normal)

# Teste 2: 6ª request bloqueada (429 Too Many Requests)
curl -v http://localhost:3000/auth/login 2>&1 | grep "< HTTP"
# Esperado: "429 Too Many Requests"

# Teste 3: Redis offline (simular)
redis-cli SHUTDOWN
curl -v http://localhost:3000/auth/login 2>&1 | grep "< HTTP"
# Esperado: "429 Too Many Requests" (fail-closed)
redis-server &

# 5. Monitoring
grep "RATE_LIMIT\|429" logs/combined.log
# Esperado: Log entries com blockeios

# 6. Load test
k6 run test/load/k6-load-test.js --rps 100
# Esperado: Distribuição correta de requests, <5% bloqueados

# 7. Commit
git add .
git commit -m "feat(security): implement resilient rate limiting with fail-closed strategy"
git push origin feature/rate-limiting
```

### PR #5: CSRF Protection

```bash
# 1. Integrar service
code backend/src/app.module.ts
# providers: [CsrfProtectionService]

# 2. Integrar guard
code backend/src/forms/forms.controller.ts
# @UseGuards(CsrfProtectionGuard)

# 3. Env vars
echo "REFRESH_CSRF_ENFORCED=true" >> .env.example
echo "REFRESH_CSRF_SECRET=your_secret_key_here" >> .env.example

# 4. Testar
npm run start:dev &

# Teste 1: Requisição sem token (deve falhar)
curl -X POST http://localhost:3000/forms/submit
# Esperado: 403 Forbidden

# Teste 2: Obter token
TOKEN=$(curl http://localhost:3000/auth/csrf-token | jq -r '.token')

# Teste 3: Com token válido
curl -X POST http://localhost:3000/forms/submit \
  -H "X-CSRF-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'
# Esperado: 200 OK

# Teste 4: Token inválido
curl -X POST http://localhost:3000/forms/submit \
  -H "X-CSRF-Token: invalid_token"
# Esperado: 403 Forbidden

# 5. Report-only mode test
REFRESH_CSRF_ENFORCED=false npm run start:dev &
curl -X POST http://localhost:3000/forms/submit
# Esperado: 200 OK (mas logged como violation)

# 6. Commit
git add .
git commit -m "feat(security): implement CSRF token protection with session binding"
git push origin feature/csrf-protection
```

### PR #6-7: Cache & N+1 Detection

```bash
# PR #6: Dashboard Cache (se stubs foram fixados em 03/04)
npm run start:dev &

# Teste 1: Cache hit
time curl http://localhost:3000/dashboard/metrics
# Esperado: ~50ms

# Teste 2: Cache expire (5 min depois)
sleep 310
time curl http://localhost:3000/dashboard/metrics
# Esperado: ~500ms (query executada novamente)

# PR #7: N+1 Detection (dev only)
npm test -- n1-query-detector.spec.ts
# Esperado: ✅ Detecta padrões N+1

grep "N1_QUERY" logs/development.log
# Esperado: Log de suspeitas
```

---

## 📊 SEMANA 3-4 (Database Maintenance)

### PR #8-9: Index Monitor & Replica

```bash
# PR #8: Continuous monitoring
psql -U postgres -d seguraca << EOF
-- Setup monitoring query
CREATE OR REPLACE VIEW v_index_health AS
SELECT 
  schemaname, tablename, indexname,
  CASE 
    WHEN idx_scan = 0 THEN 'UNUSED'
    ELSE 'OK'
  END as status
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Check daily
SELECT * FROM v_index_health;
EOF

# PR #9: Read replica (advanced, optional)
# Consultar com DBA primeiro!
# psql -f backend/scripts/setup-read-replica.sql
# (Complex setup, skipped here)
```

---

## ✅ FINAL VALIDATION (Before Go-Live)

```bash
# 1. Code checks
npm audit --omit=dev              # → 0 CVEs
npm run type-check                # → ✅
npm run lint                      # → ✅
npm test                          # → ✅ all pass
npm run build                     # → ✅

# 2. Performance
k6 run test/load/k6-load-test.js --vus 500 --duration 10m
# Esperado: P95 < 200ms, error < 0.5%

# 3. Database health
psql -f backend/scripts/validate-indexes.sql
psql -f backend/scripts/optimize-database.sql
VACUUM ANALYZE;

# 4. Monitoring check
curl http://monitoring:3000/health   # → 200 OK

# 5. Backup verification
pg_dump -Fc seguraca > final_backup_prod.dump
# Size should match previous backups

# 6. Ready for production!
echo "✅ All checks passed!"
git tag -a v2.0.0 -m "Production Release: Database Optimization"
git push origin v2.0.0
```

---

## 🆘 QUICK TROUBLESHOOTING

```bash
# Problema: npm audit não roda
npm cache clean --force
npm ci

# Problema: Testes falhando
npm run test -- --detectOpenHandles
# Identifica resources não liberados

# Problema: Type errors
npm run type-check -- --pretty
# Output mais legível

# Problema: Lint errors
npm run lint -- --fix
# Tenta consertar automaticamente

# Problema: Staging fora
git status
git log --oneline -5
# Volta para último bom commit se necessário:
git reset --hard <commit-hash>

# Problema: Redis não roda
redis-cli ping
# Se não responde:
redis-server /path/to/redis.conf &

# Problema: Database locked
psql -c "SELECT * FROM pg_stat_activity WHERE datname = 'seguraca';"
# Kill connections se necessário:
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'seguraca';"
```

---

## 📱 USEFUL SHORTCUTS

```bash
# Copy-paste ready commands:

# Criar branch nova
git checkout -b feature/nome-da-feature

# Ver última atividade
git log --oneline -10

# Voltar mudanças locais
git checkout -- .

# Stash mudanças temporariamente
git stash
git stash pop

# Rebase (limpa história)
git rebase -i HEAD~3

# Squash commits
git rebase -i HEAD~2
# Mark "squash" na segunda linha

# Check merge conflicts
git status
# Fix files, then:
git add .
git commit -m "Merge conflict resolution"
```

---

## 📞 QUICK REFERENCE

| Comando | O que faz | Quando usar |
|---------|----------|------------|
| `npm audit fix` | Remove CVEs de dependências | Semana 1 |
| `npm test` | Roda suite de testes | Sempre antes de commit |
| `npm run lint` | Verifica código style | Antes de PR |
| `npm run type-check` | Valida tipos TypeScript | Antes de merge |
| `k6 run` | Load test | Após cada feature |
| `npm run start:dev` | Inicia app local | Development |
| `psql -f script.sql` | Executa SQL | Database changes |
| `git push` | Envia para remote | Após commit |
| `git pull` | Baixa mudanças | Inicio do dia |
| `redis-cli` | Redis client | Debug cache |

---

## 🎯 DAILY CHECKLIST

```
☐ Puxar mudanças remotas (git pull)
☐ Rodar testes (npm test)
☐ Verificar lints (npm run lint)
☐ Atualizar este arquivo com progresso
☐ Commit mudanças (git add . && git commit ...)
☐ Push para remote (git push)
☐ Atualizar board do projeto
☐ Responder pull requests (code review)
```

---

**Última atualização:** 02/04/2026  
**Válido para:** 4 semanas (até ~30/04/2026)

Boa sorte! 🚀
