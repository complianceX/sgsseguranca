# 🚀 Checklist de Deploy para Produção

## ✅ PRÉ-DEPLOY - SEGURANÇA

### 1. Variáveis de Ambiente
- [ ] `NODE_ENV=production` configurado
- [ ] `JWT_SECRET` com mínimo 32 caracteres (gerar com: `openssl rand -base64 32`)
- [ ] `DATABASE_SSL=true` habilitado
- [ ] `REDIS_HOST` configurado (obrigatório em produção)
- [ ] `REDIS_PASSWORD` configurado
- [ ] `REDIS_TLS=true` se Redis em nuvem
- [ ] Todas as senhas são fortes (mínimo 16 caracteres)
- [ ] Credenciais AWS/R2 configuradas
- [ ] SMTP configurado e testado

### 2. Banco de Dados
- [ ] SSL habilitado (`DATABASE_SSL=true`)
- [ ] Certificado CA configurado (se necessário)
- [ ] Connection pooling configurado (max: 20, min: 5)
- [ ] Migrations executadas
- [ ] Backup automático configurado
- [ ] Índices criados (rodar `criar-indices.bat`)

### 3. Redis
- [ ] Redis instalado e rodando
- [ ] Senha configurada
- [ ] TLS habilitado (se em nuvem)
- [ ] Persistência configurada (AOF ou RDB)
- [ ] Maxmemory policy configurado

### 4. Código
- [ ] `synchronize: false` no TypeORM (NUNCA true em produção)
- [ ] `rejectUnauthorized: false` REMOVIDO
- [ ] Logs de console substituídos por Logger NestJS
- [ ] Error handling implementado
- [ ] Validação de entrada em todos os endpoints
- [ ] Rate limiting configurado

### 5. Dependências
- [ ] `npm audit` executado e vulnerabilidades corrigidas
- [ ] Dependências atualizadas
- [ ] `joi` instalado: `npm install joi`
- [ ] `cache-manager-redis-store` instalado
- [ ] `@types/cache-manager-redis-store` instalado (dev)

## ✅ DEPLOY

### 1. Build
```bash
cd backend
npm install --production
npm run build
```

### 2. Testes
```bash
# Testes unitários
npm run test

# Testes E2E
npm run test:e2e

# Coverage
npm run test:cov
```

### 3. Migrations
```bash
# Rodar migrations
npm run typeorm migration:run

# Verificar status
npm run typeorm migration:show
```

### 4. Variáveis de Ambiente
```bash
# Copiar exemplo
cp .env.production.example .env

# Editar com valores reais
nano .env

# Verificar variáveis
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

### 5. Iniciar Aplicação
```bash
# Produção
npm run start:prod

# Com PM2 (recomendado)
pm2 start dist/main.js --name "sst-backend" -i max

# Com Docker
docker-compose up -d
```

## ✅ PÓS-DEPLOY

### 1. Verificação de Saúde
- [ ] Health check respondendo: `GET /health`
- [ ] Enhanced health check: `GET /health/enhanced`
- [ ] Métricas Prometheus: `GET /metrics`
- [ ] Logs sem erros críticos

### 2. Monitoramento
- [ ] Jaeger configurado e recebendo traces
- [ ] Prometheus coletando métricas
- [ ] Grafana dashboards configurados
- [ ] Alertas configurados

### 3. Testes de Integração
- [ ] Login funcionando
- [ ] CRUD de entidades funcionando
- [ ] Upload de arquivos funcionando
- [ ] Envio de emails funcionando
- [ ] WebSockets funcionando
- [ ] Filas processando jobs

### 4. Performance
- [ ] Tempo de resposta < 200ms (p95)
- [ ] Taxa de erro < 1%
- [ ] CPU < 70%
- [ ] Memória < 80%
- [ ] Conexões DB < 15

### 5. Segurança
- [ ] HTTPS habilitado
- [ ] CORS configurado corretamente
- [ ] Helmet configurado
- [ ] Rate limiting funcionando
- [ ] JWT expirando corretamente
- [ ] Logs de auditoria funcionando

## ✅ ROLLBACK (SE NECESSÁRIO)

### 1. Reverter Deploy
```bash
# Git
git revert HEAD
git push origin main

# Railway
railway rollback

# PM2
pm2 reload sst-backend --update-env
```

### 2. Reverter Migrations
```bash
npm run typeorm migration:revert
```

### 3. Restaurar Backup
```bash
# PostgreSQL
pg_restore -h host -U user -d database backup.dump

# Redis
redis-cli --rdb backup.rdb
```

## 🔒 SEGURANÇA - CHECKLIST FINAL

### Crítico
- [ ] SSL/TLS habilitado em TODAS as conexões
- [ ] Senhas fortes (mínimo 16 caracteres)
- [ ] JWT_SECRET com mínimo 32 caracteres
- [ ] `rejectUnauthorized: false` REMOVIDO
- [ ] `synchronize: false` no TypeORM
- [ ] Rate limiting configurado
- [ ] CORS restrito a domínios conhecidos

### Importante
- [ ] Logs de auditoria habilitados
- [ ] Backup automático configurado
- [ ] Monitoramento de segurança ativo
- [ ] Alertas de falhas configurados
- [ ] Rotação de credenciais agendada
- [ ] 2FA habilitado em serviços críticos

### Recomendado
- [ ] WAF configurado (Cloudflare, AWS WAF)
- [ ] DDoS protection ativo
- [ ] Penetration testing realizado
- [ ] Security headers configurados (Helmet)
- [ ] Content Security Policy configurado
- [ ] Logs centralizados (ELK, Datadog)

## 📊 MÉTRICAS DE SUCESSO

### Performance
- Tempo de resposta p95: < 200ms
- Tempo de resposta p99: < 500ms
- Taxa de erro: < 1%
- Uptime: > 99.9%

### Recursos
- CPU: < 70%
- Memória: < 80%
- Disco: < 80%
- Conexões DB: < 15 (de 20 max)

### Segurança
- Vulnerabilidades críticas: 0
- Vulnerabilidades altas: 0
- SSL Labs Score: A+
- Security Headers Score: A

## 🆘 CONTATOS DE EMERGÊNCIA

### Equipe
- DevOps: devops@company.com
- Backend: backend@company.com
- Segurança: security@company.com

### Serviços
- Railway: https://railway.app/support
- Cloudflare: https://support.cloudflare.com
- AWS: https://aws.amazon.com/support

## 📚 DOCUMENTAÇÃO

- [Runbook de Produção](./docs/RUNBOOK_PRODUCTION.md)
- [Incident Playbook](./docs/INCIDENT_PLAYBOOK.md)
- [Observability Guide](./docs/OBSERVABILITY.md)
- [Security Audit](./SECURITY_AUDIT_REPORT.md)

---

**Data do Deploy**: _____________
**Responsável**: _____________
**Versão**: _____________
**Commit**: _____________

**Assinatura**: _____________
