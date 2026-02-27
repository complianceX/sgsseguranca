# 🚨 Incident Playbook - Wanderson Gandra

## Resposta Rápida a Incidentes

### SEVERIDADE

- **P1 (Crítico):** Sistema completamente indisponível, dados em risco
- **P2 (Alto):** Funcionalidade crítica afetada, alguns usuários impactados
- **P3 (Médio):** Funcionalidade não-crítica afetada
- **P4 (Baixo):** Problema menor, sem impacto significativo

---

## P1: SISTEMA INDISPONÍVEL

### Sintomas
- API retorna 500 para todas as requisições
- Banco de dados não responde
- Redis não responde
- Nginx não consegue rotear

### Ações Imediatas (0-5 min)
```bash
# 1. Verificar status
docker-compose ps

# 2. Verificar logs
docker-compose logs api | tail -50
docker-compose logs db | tail -50
docker-compose logs redis | tail -50

# 3. Tentar restart
docker-compose restart api
docker-compose restart db
docker-compose restart redis

# 4. Verificar health
curl http://localhost:3001/health
```

### Se Restart Não Funcionar (5-15 min)
```bash
# 1. Parar tudo
docker-compose down

# 2. Verificar espaço em disco
df -h

# 3. Limpar volumes (CUIDADO!)
docker volume prune

# 4. Reiniciar
docker-compose up -d

# 5. Executar migrações
docker-compose exec api npm run migration:run

# 6. Verificar
curl http://localhost:3001/health
```

### Se Ainda Não Funcionar (15-30 min)
```bash
# 1. Restaurar backup
docker-compose down
gunzip -c /backups/db_backup_*.sql.gz | \
  docker-compose exec -T db psql -U sst_user -d sst
docker-compose up -d

# 2. Verificar
curl http://localhost:3001/health

# 3. Notificar stakeholders
# - Enviar email
# - Postar no Slack
# - Atualizar status page
```

### Escalação
- Se > 30 min: Chamar DevOps Lead
- Se > 1 hora: Chamar CTO
- Se > 2 horas: Ativar Disaster Recovery

---

## P2: FUNCIONALIDADE CRÍTICA AFETADA

### Sintomas
- Erro ao fazer login
- Erro ao gerar PDF
- Erro ao acessar dados críticos
- Taxa de erro > 5%

### Ações Imediatas (0-5 min)
```bash
# 1. Identificar o serviço afetado
docker-compose logs api | grep ERROR | tail -20

# 2. Verificar recursos
docker stats

# 3. Verificar database
docker-compose exec db psql -U sst_user -d sst -c "SELECT 1"

# 4. Verificar Redis
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping

# 5. Reiniciar serviço afetado
docker-compose restart api
```

### Investigação (5-15 min)
```bash
# 1. Verificar logs estruturados
docker-compose logs api | grep "ERROR" | jq .

# 2. Verificar métricas
curl http://localhost:3001/health/detailed

# 3. Verificar queries lentas
docker-compose exec db psql -U sst_user -d sst -c \
  "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 5"

# 4. Verificar índices
docker-compose exec db psql -U sst_user -d sst -c \
  "SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0"
```

### Remediação (15-30 min)
```bash
# Se for problema de performance:
docker-compose exec db psql -U sst_user -d sst -c "ANALYZE"
docker-compose exec db psql -U sst_user -d sst -c "REINDEX DATABASE sst"

# Se for problema de memória:
docker-compose restart api

# Se for problema de conexão:
docker-compose restart db
docker-compose restart redis

# Se for problema de código:
git pull origin main
docker-compose up -d --build
docker-compose exec api npm run migration:run
```

### Comunicação
- Notificar usuários afetados
- Postar update no Slack
- Atualizar status page

---

## P3: FUNCIONALIDADE NÃO-CRÍTICA AFETADA

### Ações (0-30 min)
```bash
# 1. Investigar
docker-compose logs api | grep ERROR

# 2. Reproduzir
# - Testar manualmente
# - Verificar logs

# 3. Remediar
# - Restart serviço
# - Aplicar patch
# - Rollback se necessário

# 4. Comunicar
# - Postar no Slack
# - Criar issue no GitHub
```

---

## P4: PROBLEMA MENOR

### Ações (Próximas 24 horas)
- Criar issue no GitHub
- Investigar quando tiver tempo
- Aplicar fix na próxima release

---

## CENÁRIOS ESPECÍFICOS

### Cenário 1: Taxa de Erro Alta (> 5%)

```bash
# 1. Identificar tipo de erro
docker-compose logs api | grep ERROR | cut -d' ' -f5 | sort | uniq -c | sort -rn

# 2. Verificar logs estruturados
docker-compose logs api | grep "ERROR" | jq '.error_type' | sort | uniq -c

# 3. Remediar
# - Se for timeout: aumentar timeout
# - Se for OOM: aumentar memória
# - Se for DB: otimizar queries
# - Se for código: fazer rollback
```

### Cenário 2: Lentidão (Latência > 1s)

```bash
# 1. Verificar CPU
docker stats api

# 2. Verificar memória
docker-compose exec api ps aux | grep node

# 3. Verificar queries lentas
docker-compose exec db psql -U sst_user -d sst -c \
  "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10"

# 4. Remediar
# - Aumentar recursos
# - Otimizar queries
# - Adicionar índices
# - Aumentar cache
```

### Cenário 3: Banco de Dados Cheio

```bash
# 1. Verificar tamanho
docker-compose exec db psql -U sst_user -d sst -c \
  "SELECT pg_size_pretty(pg_database_size('sst'))"

# 2. Verificar tabelas grandes
docker-compose exec db psql -U sst_user -d sst -c \
  "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10"

# 3. Remediar
# - Limpar dados antigos
# - Arquivar dados
# - Aumentar espaço em disco
# - Particionar tabelas
```

### Cenário 4: Redis Cheio

```bash
# 1. Verificar memória
docker-compose exec redis redis-cli -a $REDIS_PASSWORD info memory

# 2. Verificar chaves grandes
docker-compose exec redis redis-cli -a $REDIS_PASSWORD --bigkeys

# 3. Remediar
# - Limpar chaves expiradas
# - Aumentar memória
# - Implementar eviction policy
```

### Cenário 5: Fila de Jobs Travada

```bash
# 1. Verificar fila
curl http://localhost:3001/bull-board

# 2. Contar jobs
docker-compose exec redis redis-cli -a $REDIS_PASSWORD LLEN bull:pdf-queue:wait

# 3. Remediar
# - Reiniciar workers
# - Limpar fila (com cuidado)
# - Aumentar workers
# - Investigar por que jobs estão falhando
```

---

## COMUNICAÇÃO

### Template de Notificação
```
🚨 INCIDENTE: [Título]
Severidade: [P1/P2/P3/P4]
Status: [Investigando/Remediando/Resolvido]
Impacto: [Descrição]
ETA: [Tempo estimado]
Atualizações: [Link para status page]
```

### Escalação
- **0-15 min:** Investigar
- **15-30 min:** Notificar DevOps Lead
- **30-60 min:** Notificar CTO
- **> 60 min:** Ativar Disaster Recovery

---

## PÓS-INCIDENTE

### Checklist (Dentro de 24 horas)
- [ ] Documentar causa raiz
- [ ] Criar issue no GitHub
- [ ] Implementar prevenção
- [ ] Atualizar runbooks
- [ ] Comunicar lições aprendidas

### Postmortem (Dentro de 1 semana)
- [ ] Reunião com time
- [ ] Análise de causa raiz
- [ ] Ações preventivas
- [ ] Documentar no wiki

---

**Última atualização:** 2026-02-24
