# Security Audit Checklist

Use esta checklist para auditorias de segurança regulares (recomendado: trimestral).

## 🔐 Autenticação e Autorização

- [ ] Todos os usuários admin têm 2FA habilitado
- [ ] Senhas seguem política de complexidade (10+ chars, maiúscula, minúscula, número, especial)
- [ ] Tokens JWT têm TTL apropriado (15min access, 7 dias refresh)
- [ ] Rate limiting está funcionando (testar com múltiplas tentativas de login)
- [ ] Sessões antigas são revogadas automaticamente (limite de 5 sessões)
- [ ] Logout revoga tokens corretamente
- [ ] Refresh token rotation está ativo

**Teste:**
```bash
# Testar rate limiting
for i in {1..10}; do curl -X POST https://seu-dominio.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"cpf":"12345678900","password":"wrong"}'; done
```

---

## 🔒 Criptografia

- [ ] HTTPS está ativo e forçado (HTTP redireciona para HTTPS)
- [ ] Certificado SSL é válido e não expira em breve
- [ ] TLS 1.2+ está configurado (TLS 1.0/1.1 desabilitado)
- [ ] Dados sensíveis são criptografados no banco (CPF, email, telefone)
- [ ] Senhas usam bcrypt com 12+ salt rounds
- [ ] Secrets têm 32+ caracteres de entropia
- [ ] Encryption keys são diferentes entre ambientes

**Teste:**
```bash
# Verificar SSL
openssl s_client -connect seu-dominio.com:443 -tls1_2

# Verificar headers
curl -I https://seu-dominio.com | grep -i "strict-transport"
```

---

## 🛡️ Proteção de API

- [ ] CORS está configurado com whitelist (não usa *)
- [ ] Helmet.js está ativo com todos os headers
- [ ] Rate limiting global está ativo (100 req/s)
- [ ] Rate limiting de login está ativo (5 req/min por CPF)
- [ ] Body size limit está configurado (10MB)
- [ ] Input validation está ativa em todos os endpoints
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection (sanitização de inputs)

**Teste:**
```bash
# Testar CORS
curl -H "Origin: https://malicious-site.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS https://seu-dominio.com/auth/login

# Testar XSS
curl -X POST https://seu-dominio.com/users \
  -H "Content-Type: application/json" \
  -d '{"nome":"<script>alert(1)</script>"}'
```

---

## 🗄️ Segurança de Banco de Dados

- [ ] PostgreSQL não está exposto externamente (porta 5432 fechada)
- [ ] Row-Level Security (RLS) está ativo
- [ ] Usuário do banco tem privilégios mínimos necessários
- [ ] Backups automáticos estão funcionando
- [ ] Backups são criptografados
- [ ] Backups são testados regularmente (restore test)
- [ ] Audit logs estão sendo gerados
- [ ] Audit logs têm hash chain íntegro

**Teste:**
```bash
# Verificar se porta está fechada externamente
nmap -p 5432 seu-dominio.com

# Verificar RLS
docker-compose exec db psql -U sst_user -d sst \
  -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'"

# Testar backup
docker-compose exec api /app/scripts/backup-database.sh
```

---

## 🔴 Redis

- [ ] Redis não está exposto externamente (porta 6379 fechada)
- [ ] Redis tem senha configurada
- [ ] Redis usa appendonly para persistência
- [ ] Cache TTL está configurado apropriadamente
- [ ] Sessões expiram corretamente

**Teste:**
```bash
# Verificar se porta está fechada
nmap -p 6379 seu-dominio.com

# Testar autenticação
docker-compose exec redis redis-cli ping  # Deve falhar sem senha
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping  # Deve retornar PONG
```

---

## 🐳 Docker e Infraestrutura

- [ ] Containers rodam como usuário não-root
- [ ] Imagens são atualizadas regularmente
- [ ] Vulnerabilidades de imagens são escaneadas (Trivy)
- [ ] .dockerignore está configurado
- [ ] Secrets não estão em Dockerfile
- [ ] Health checks estão configurados
- [ ] Logs são coletados e monitorados

**Teste:**
```bash
# Verificar usuário do container
docker-compose exec api whoami  # Não deve ser root

# Escanear vulnerabilidades
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image wanderson-gandra-api:latest
```

---

## 📊 Monitoramento e Logs

- [ ] Logs de auditoria estão sendo gerados
- [ ] Logs de segurança são monitorados
- [ ] Alertas estão configurados para eventos críticos
- [ ] Incidentes de segurança são registrados
- [ ] Métricas de segurança são coletadas (tentativas de login, 2FA adoption)
- [ ] Health checks estão funcionando
- [ ] Uptime monitoring está ativo

**Teste:**
```bash
# Verificar logs de auditoria
docker-compose exec db psql -U sst_user -d sst \
  -c "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours'"

# Verificar health check
curl https://seu-dominio.com/health
```

---

## 🔄 Gestão de Secrets

- [ ] Secrets não estão commitados no git
- [ ] .env está no .gitignore
- [ ] Secrets são diferentes entre dev/staging/prod
- [ ] Secrets têm alta entropia (gerados com openssl)
- [ ] Secrets são rotacionados regularmente (90 dias)
- [ ] Acesso a secrets é auditado
- [ ] Secrets manager está em uso (ou planejado)

**Teste:**
```bash
# Verificar se secrets estão no git
git log --all --full-history -- "*.env"  # Não deve retornar nada

# Verificar entropia de secrets
echo $JWT_SECRET | wc -c  # Deve ser 64+
```

---

## 👥 Gestão de Usuários

- [ ] Princípio do menor privilégio está aplicado
- [ ] Usuários inativos são desabilitados
- [ ] Permissões são revisadas regularmente
- [ ] Acesso admin é auditado
- [ ] Mudanças de senha são forçadas periodicamente
- [ ] Contas de serviço têm permissões mínimas

**Teste:**
```bash
# Listar usuários admin
docker-compose exec db psql -U sst_user -d sst \
  -c "SELECT nome, email, twoFactorEnabled FROM users WHERE funcao LIKE '%admin%'"
```

---

## 🚨 Resposta a Incidentes

- [ ] Plano de resposta a incidentes está documentado
- [ ] Contatos de emergência estão atualizados
- [ ] Procedimento de rollback está testado
- [ ] Backups podem ser restaurados rapidamente
- [ ] Logs são preservados por tempo adequado (1 ano)
- [ ] Equipe sabe como isolar o sistema em emergência

**Teste:**
```bash
# Testar rollback
git checkout <versao-anterior>
docker-compose up -d --build

# Testar restore de backup
# (Ver DEPLOYMENT_GUIDE.md)
```

---

## 📱 Compliance

- [ ] LGPD: Consentimentos estão sendo coletados
- [ ] LGPD: Direitos dos titulares podem ser exercidos
- [ ] LGPD: DPO está designado (se aplicável)
- [ ] Termos de uso estão atualizados
- [ ] Política de privacidade está atualizada
- [ ] Retenção de dados está configurada
- [ ] Dados podem ser exportados/deletados sob demanda

---

## 🔍 Testes de Penetração

- [ ] Scan de vulnerabilidades foi executado (último: _____)
- [ ] Pentest profissional foi realizado (último: _____)
- [ ] Vulnerabilidades encontradas foram corrigidas
- [ ] OWASP Top 10 foi verificado
- [ ] Dependências foram auditadas (npm audit)

**Teste:**
```bash
# Audit de dependências
cd backend && npm audit
cd frontend && npm audit

# Scan de portas
nmap -sV seu-dominio.com
```

---

## 📝 Documentação

- [ ] Documentação de segurança está atualizada
- [ ] Procedimentos de deploy estão documentados
- [ ] Runbooks de incidentes estão atualizados
- [ ] Arquitetura de segurança está documentada
- [ ] Políticas de segurança estão publicadas

---

## ✅ Resultado da Auditoria

**Data:** _______________
**Auditor:** _______________
**Score:** _____ / 100

**Itens Críticos Pendentes:**
1. 
2. 
3. 

**Prazo para Correção:** _______________

**Próxima Auditoria:** _______________

---

## 🎯 Metas de Segurança

- [ ] 100% dos admins com 2FA
- [ ] 0 vulnerabilidades críticas
- [ ] 0 secrets expostos
- [ ] 99.9% uptime
- [ ] < 5min MTTR (Mean Time To Respond)
- [ ] Backups testados mensalmente
- [ ] Pentest anual realizado

---

**Última atualização:** 2026-02-24
**Próxima revisão:** 2026-05-24
