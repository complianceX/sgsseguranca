# ✅ Production Readiness Checklist

## PRÉ-DEPLOYMENT

### Código
- [ ] Todos os console.log removidos
- [ ] Sem `any` types (TypeScript strict)
- [ ] Sem secrets em código
- [ ] Sem TODO/FIXME comentários
- [ ] Linting passou (npm run lint:ci)
- [ ] Auto-fix executado só quando intencional (npm run lint:fix)
- [ ] Testes passaram (npm run test)
- [ ] Build passou (npm run build)
- [ ] Sem warnings de build

### Segurança
- [ ] JWT_SECRET >= 64 caracteres
- [ ] ENCRYPTION_KEY >= 32 caracteres
- [ ] ENCRYPTION_SALT >= 16 caracteres
- [ ] Database password forte
- [ ] Redis password forte
- [ ] CORS configurado corretamente
- [ ] HTTPS obrigatório
- [ ] Headers de segurança (Helmet)
- [ ] Rate limiting ativado
- [ ] 2FA ativado para admins

### Banco de Dados
- [ ] Migrações executadas
- [ ] Índices criados
- [ ] Backup testado
- [ ] Disaster Recovery testado
- [ ] Connection pooling configurado
- [ ] Replicação configurada (se aplicável)

### Infraestrutura
- [ ] Docker images otimizadas
- [ ] Healthchecks configurados
- [ ] Volumes persistentes configurados
- [ ] Networking isolado
- [ ] Firewall configurado
- [ ] SSL/TLS configurado
- [ ] Backup automatizado
- [ ] Monitoramento ativado

### Observabilidade
- [ ] Logging estruturado ativado
- [ ] Métricas coletadas
- [ ] Tracing distribuído ativado
- [ ] Alertas configurados
- [ ] Dashboards criados
- [ ] SLA definido

### Documentação
- [ ] Runbook de produção
- [ ] Incident playbook
- [ ] SLA documentado
- [ ] Observability documentada
- [ ] Disaster recovery documentado
- [ ] Contatos de emergência

---

## DEPLOYMENT

### Antes de Fazer Deploy
```bash
# 1. Backup
docker-compose exec api /app/scripts/backup-database.sh

# 2. Verificar status
docker-compose ps
curl http://localhost:3001/health

# 3. Verificar logs
docker-compose logs api | tail -20

# 4. Verificar métricas
curl http://localhost:3001/health/detailed
```

### Durante Deploy
```bash
# 1. Pull código
git pull origin main

# 2. Build
docker-compose up -d --build

# 3. Executar migrações
docker-compose exec api npm run migration:run

# 4. Verificar
docker-compose logs -f api
```

### Após Deploy
```bash
# 1. Health check
curl http://localhost:3001/health

# 2. Verificar logs
docker-compose logs api | grep ERROR

# 3. Verificar métricas
curl http://localhost:3001/health/detailed

# 4. Testar funcionalidades críticas
# - Login
# - Gerar PDF
# - Acessar dados

# 5. Monitorar por 30 minutos
# - Taxa de erro
# - Latência
# - Memória
```

---

## PÓS-DEPLOYMENT

### Primeiras 24 Horas
- [ ] Monitorar taxa de erro
- [ ] Monitorar latência
- [ ] Monitorar memória
- [ ] Verificar logs
- [ ] Verificar alertas
- [ ] Comunicar com usuários

### Primeiros 7 Dias
- [ ] Executar testes de carga
- [ ] Verificar performance
- [ ] Coletar feedback
- [ ] Documentar issues
- [ ] Fazer otimizações

### Primeiros 30 Dias
- [ ] Executar Disaster Recovery test
- [ ] Revisar SLA
- [ ] Revisar observabilidade
- [ ] Fazer postmortem
- [ ] Planejar melhorias

---

## MONITORAMENTO CONTÍNUO

### Diário
- [ ] Verificar health check
- [ ] Verificar logs de erro
- [ ] Verificar taxa de erro
- [ ] Verificar latência
- [ ] Verificar espaço em disco
- [ ] Verificar conexões ativas
- [ ] Verificar fila de jobs
- [ ] Verificar backup status

### Semanal
- [ ] Revisar logs
- [ ] Revisar métricas
- [ ] Revisar alertas
- [ ] Revisar performance
- [ ] Revisar segurança

### Mensal
- [ ] Executar Disaster Recovery test
- [ ] Revisar SLA
- [ ] Revisar observabilidade
- [ ] Revisar segurança
- [ ] Planejar melhorias

### Trimestral
- [ ] Revisar arquitetura
- [ ] Revisar capacidade
- [ ] Revisar segurança
- [ ] Revisar compliance
- [ ] Planejar roadmap

---

## ESCALABILIDADE

### Quando Escalar
- [ ] CPU > 70% por > 1 hora
- [ ] Memória > 80% por > 1 hora
- [ ] Latência P95 > 500ms
- [ ] Taxa de erro > 1%
- [ ] Conexões DB > 80% do pool

### Como Escalar
```bash
# 1. Aumentar recursos
# - Editar docker-compose.yml
# - Aumentar limits

# 2. Aumentar réplicas
# - Editar deployment
# - Aumentar replicas

# 3. Aumentar workers
# - Editar KEDA scaledobject
# - Aumentar maxReplicaCount

# 4. Otimizar queries
# - Adicionar índices
# - Refatorar queries

# 5. Aumentar cache
# - Aumentar TTL
# - Adicionar cache layers
```

---

## SEGURANÇA

### Verificações Diárias
- [ ] Verificar logs de auditoria
- [ ] Verificar incidentes de segurança
- [ ] Verificar tentativas de acesso não autorizado
- [ ] Verificar rate limiting

### Verificações Semanais
- [ ] Revisar permissões de usuários
- [ ] Revisar tokens revogados
- [ ] Revisar backups criptografados
- [ ] Revisar SSL/TLS

### Verificações Mensais
- [ ] Executar security scan
- [ ] Revisar dependências
- [ ] Revisar compliance
- [ ] Revisar auditoria

### Verificações Anuais
- [ ] Executar pentest
- [ ] Revisar ISO 27001
- [ ] Revisar OWASP Top 10
- [ ] Revisar disaster recovery

---

## BACKUP & DISASTER RECOVERY

### Backup Diário
- [ ] Backup executado
- [ ] Backup criptografado
- [ ] Backup armazenado remotamente
- [ ] Backup testado

### Disaster Recovery Mensal
- [ ] Executar DR test
- [ ] Verificar RTO
- [ ] Verificar RPO
- [ ] Documentar resultados

### Disaster Recovery Anual
- [ ] Executar full DR test
- [ ] Testar em hardware diferente
- [ ] Testar em região diferente
- [ ] Documentar lições aprendidas

---

## PERFORMANCE

### Baseline
- [ ] API Response: < 200ms (p95)
- [ ] Database Query: < 100ms (p95)
- [ ] PDF Generation: < 5s (p95)
- [ ] Error Rate: < 0.1%

### Monitoramento
- [ ] Latência por endpoint
- [ ] Taxa de erro por endpoint
- [ ] Duração de queries
- [ ] Cache hit ratio
- [ ] Memória usada

### Otimização
- [ ] Adicionar índices
- [ ] Refatorar queries
- [ ] Aumentar cache
- [ ] Aumentar recursos
- [ ] Escalar horizontalmente

---

## COMPLIANCE

### ISO 27001
- [ ] A.5: Políticas de Segurança
- [ ] A.9: Controle de Acesso
- [ ] A.10: Criptografia
- [ ] A.12: Segurança nas Operações
- [ ] A.13: Comunicações
- [ ] A.14: Desenvolvimento

### OWASP Top 10
- [ ] Injection
- [ ] Broken Authentication
- [ ] Sensitive Data Exposure
- [ ] XML/XXE
- [ ] Broken Access Control
- [ ] Security Misconfiguration
- [ ] XSS
- [ ] Insecure Deserialization
- [ ] Using Components with Known Vulns
- [ ] Insufficient Logging

### GDPR (se aplicável)
- [ ] Consentimento do usuário
- [ ] Direito ao esquecimento
- [ ] Portabilidade de dados
- [ ] Notificação de breach
- [ ] Data Protection Officer

---

## COMUNICAÇÃO

### Stakeholders
- [ ] Comunicar status
- [ ] Comunicar incidentes
- [ ] Comunicar manutenção
- [ ] Comunicar performance

### Usuários
- [ ] Status page atualizada
- [ ] Notificações de manutenção
- [ ] Notificações de incidente
- [ ] Feedback channel

### Time
- [ ] Runbook atualizado
- [ ] Incident playbook atualizado
- [ ] Documentação atualizada
- [ ] Treinamento realizado

---

## ROLLBACK

### Preparação
- [ ] Backup antes de deploy
- [ ] Versão anterior testada
- [ ] Rollback script pronto
- [ ] Comunicação planejada

### Execução
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

**Última atualização:** 2026-02-24
**Próxima revisão:** 2026-05-24
