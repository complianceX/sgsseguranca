# 📖 Runbook de Produção - Wanderson Gandra

## 1. STARTUP & HEALTH CHECKS

### 1.1 Iniciar Sistema
```bash
# Verificar status dos containers
docker-compose ps

# Iniciar sistema
docker-compose up -d

# Verificar logs
docker-compose logs -f api

# Testar health check
curl http://localhost:3001/health
curl http://localhost:3001/health/detailed
```

### 1.2 Verificações Pré-Produção
```bash
# 1. Database connectivity
docker-compose exec db psql -U sst_user -d sst -c "SELECT 1"

# 2. Redis connectivity
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping

# 3. API responsiveness
curl -I http://localhost:3001/api

# 4. Migrations status
docker-compose exec api npm run migration:show

# 5. SSL certificate validity
openssl x509 -in backend/certbot/conf/live/seu-dominio.com/fullchain.pem -noout -dates
```

---

## 2. MONITORAMENTO

### 2.1 Métricas em Tempo Real
```bash
# CPU e Memória
docker stats

# Conexões ativas do banco
docker-compose exec db psql -U sst_user -d sst -c "SELECT count(*) FROM pg_stat_activity"

# Tamanho do banco
docker-compose exec db psql -U sst_user -d sst -c "SELECT pg_size_pretty(pg_database_size('sst'))"

# Tamanho do Redis
docker-compose exec redis redis-cli -a $REDIS_PASSWORD info memory

# Fila de jobs (BullMQ)
curl http://localhost:3001/bull-board
```

### 2.2 Logs Estruturados
```bash
# Logs em tempo real
docker-compose logs -f api

# Últimas 100 linhas
docker-compose logs --tail=100 api

# Filtrar por erro
docker-compose logs api | grep ERROR

# Filtrar por request ID
docker-compose logs api | grep "request-id-xyz"
```

### 2.3 Alertas Críticos
```bash
# Monitorar taxa de erro
docker-compose logs api | grep "ERROR" | wc -l

# Monitorar latência
docker-compose logs api | grep "duration" | tail -20

# Monitorar conexões
docker-compose exec db psql -U sst_user -d sst -c "SELECT count(*) FROM pg_stat_activity WHERE state='active'"
```

---

## 3. TROUBLESHOOTING

### 3.1 API não inicia
```bash
# Ver logs detalhados
docker-compose logs api

# Verificar variáveis de ambiente
docker-compose exec api env | grep -E "JWT|DATABASE|REDIS"

# Verificar porta em uso
lsof -i :3001

# Reiniciar container
docker-compose restart api
```

### 3.2 Erro de conexão com Database
```bash
# Verificar se DB está rodando
docker-compose ps db

# Testar conexão
docker-compose exec db psql -U sst_user -d sst -c "SELECT 1"

# Ver logs do DB
docker-compose logs db

# Reiniciar DB
docker-compose restart db

# Verificar espaço em disco
docker-compose exec db df -h
```

### 3.3 Erro de conexão com Redis
```bash
# Verificar se Redis está rodando
docker-compose ps redis

# Testar conexão
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping

# Ver logs do Redis
docker-compose logs redis

# Reiniciar Redis
docker-compose restart redis

# Verificar memória
docker-compose exec redis redis-cli -a $REDIS_PASSWORD info memory
```

### 3.4 Lentidão da API
```bash
# 1. Verificar CPU
docker stats api

# 2. Verificar memória
docker-compose exec api ps aux | grep node

# 3. Verificar queries lentas
docker-compose exec db psql -U sst_user -d sst -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10"

# 4. Verificar índices
docker-compose exec db psql -U sst_user -d sst -c "SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0"

# 5. Aumentar recursos
# Editar docker-compose.yml e aumentar limits
docker-compose up -d --build
```

### 3.5 Fila de jobs travada
```bash
# Ver status da fila
curl http://localhost:3001/bull-board

# Contar jobs na fila
docker-compose exec redis redis-cli -a $REDIS_PASSWORD LLEN bull:pdf-queue:wait

# Limpar fila (CUIDADO!)
docker-compose exec redis redis-cli -a $REDIS_PASSWORD DEL bull:pdf-queue:wait

# Reiniciar workers
docker-compose restart worker
```

---

## 4. BACKUP & RESTORE

### 4.1 Backup Manual
```bash
# Fazer backup
docker-compose exec api /app/scripts/backup-database.sh

# Listar backups
ls -lh /backups/

# Verificar integridade
gunzip -t /backups/db_backup_*.sql.gz
```

### 4.2 Restore Manual
```bash
# 1. Parar API
docker-compose stop api

# 2. Restaurar backup
gunzip -c /backups/db_backup_20260224_020000.sql.gz | \
  docker-compose exec -T db psql -U sst_user -d sst

# 3. Iniciar API
docker-compose start api

# 4. Verificar
curl http://localhost:3001/health
```

### 4.3 Disaster Recovery Test
```bash
# Executar teste de DR
chmod +x backend/scripts/disaster-recovery-test.sh
./backend/scripts/disaster-recovery-test.sh

# Verificar relatório
cat dr_test_report_*.txt
```

---

## 5. DEPLOYMENT

### 5.1 Deploy de Nova Versão
```bash
# 1. Backup antes de atualizar
docker-compose exec api /app/scripts/backup-database.sh

# 2. Pull do código
git pull origin main

# 3. Rebuild e restart
docker-compose up -d --build

# 4. Executar migrações
docker-compose exec api npm run migration:run

# 5. Verificar
docker-compose logs -f api
curl http://localhost:3001/health
```

### 5.2 Rollback
```bash
# 1. Parar containers
docker-compose down

# 2. Voltar para versão anterior
git checkout <commit-anterior>

# 3. Rebuild
docker-compose up -d --build

# 4. Restaurar backup (se necessário)
gunzip -c /backups/db_backup_*.sql.gz | \
  docker-compose exec -T db psql -U sst_user -d sst

# 5. Verificar
curl http://localhost:3001/health
```

---

## 6. PERFORMANCE TUNING

### 6.1 Otimizar Database
```bash
# Analisar tabelas
docker-compose exec db psql -U sst_user -d sst -c "ANALYZE"

# Reindex
docker-compose exec db psql -U sst_user -d sst -c "REINDEX DATABASE sst"

# Vacuum
docker-compose exec db psql -U sst_user -d sst -c "VACUUM ANALYZE"
```

### 6.2 Otimizar Redis
```bash
# Ver memória usada
docker-compose exec redis redis-cli -a $REDIS_PASSWORD info memory

# Limpar chaves expiradas
docker-compose exec redis redis-cli -a $REDIS_PASSWORD BGSAVE

# Monitorar comandos lentos
docker-compose exec redis redis-cli -a $REDIS_PASSWORD SLOWLOG GET 10
```

### 6.3 Otimizar API
```bash
# Aumentar worker threads
# Editar docker-compose.yml: NODE_OPTIONS=--max-old-space-size=1024

# Aumentar pool de conexões
# Editar .env: DB_POOL_SIZE=20

# Ativar compression
# Já ativado em main.ts

# Monitorar heap
docker-compose exec api node -e "console.log(require('v8').getHeapStatistics())"
```

---

## 7. SEGURANÇA

### 7.1 Verificar SSL/TLS
```bash
# Testar HTTPS
curl -I https://seu-dominio.com

# Verificar certificado
openssl s_client -connect seu-dominio.com:443

# Verificar headers de segurança
curl -I https://seu-dominio.com | grep -E "Strict-Transport|X-Frame|X-Content"
```

### 7.2 Verificar Rate Limiting
```bash
# Fazer múltiplas requisições
for i in {1..100}; do curl http://localhost:3001/auth/login; done

# Verificar se foi bloqueado (429)
```

### 7.3 Verificar Auditoria
```bash
# Ver logs de auditoria
docker-compose exec db psql -U sst_user -d sst -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20"

# Ver incidentes de segurança
docker-compose exec db psql -U sst_user -d sst -c "SELECT * FROM security_incidents ORDER BY created_at DESC LIMIT 20"
```

---

## 8. ESCALABILIDADE

### 8.1 Testes de Carga
```bash
# Smoke test (50 usuários)
npm run loadtest:smoke

# Baseline (100 usuários)
npm run loadtest:baseline

# Stress test (1000 usuários)
npm run loadtest:stress
```

### 8.2 Escalar Horizontalmente
```bash
# Aumentar réplicas da API
# Editar docker-compose.yml ou k8s deployment

# Aumentar workers
# Editar KEDA scaledobject.yaml

# Aumentar pool de conexões
# Editar .env: DB_POOL_SIZE
```

---

## 9. INCIDENTES

### 9.1 Resposta a Incidente
```bash
# 1. Preservar evidências
docker-compose logs > incident_logs_$(date +%Y%m%d_%H%M%S).txt

# 2. Isolar o sistema (se necessário)
docker-compose down

# 3. Investigar
# - Verificar logs
# - Verificar métricas
# - Verificar auditoria

# 4. Remediar
# - Aplicar patch
# - Restaurar backup
# - Reiniciar serviços

# 5. Documentar
# - Criar issue no GitHub
# - Documentar causa raiz
# - Implementar prevenção
```

### 9.2 Contatos de Emergência
- **DevOps Lead:** [contato]
- **Security Team:** [contato]
- **Database Admin:** [contato]

---

## 10. CHECKLIST DIÁRIO

- [ ] Verificar health check
- [ ] Verificar logs de erro
- [ ] Verificar taxa de erro
- [ ] Verificar latência da API
- [ ] Verificar espaço em disco
- [ ] Verificar conexões ativas
- [ ] Verificar fila de jobs
- [ ] Verificar backup status

---

**Última atualização:** 2026-02-24
**Versão:** 1.0
