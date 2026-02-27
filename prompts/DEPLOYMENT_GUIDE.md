# Guia de Deploy Seguro - Sistema Wanderson Gandra

## 🚀 Pré-requisitos

- Docker e Docker Compose instalados
- Domínio configurado apontando para o servidor
- Portas 80 e 443 abertas no firewall
- Servidor Linux (Ubuntu 20.04+ recomendado)

## 📋 Checklist Pré-Deploy

### 1. Gerar Secrets de Produção

```bash
cd backend
chmod +x scripts/generate-secrets.sh
./scripts/generate-secrets.sh
```

Copie os valores gerados para seu arquivo `.env`:

```bash
cp .env.example .env
# Edite .env e cole os secrets gerados
nano .env
```

### 2. Configurar Variáveis de Ambiente

Edite `backend/.env` e configure:

```bash
# Ambiente
NODE_ENV=production

# Domínio
FRONTEND_URL=https://seu-dominio.com

# Database (use valores fortes gerados)
DATABASE_PASSWORD=<valor-gerado>

# Redis (use valor forte gerado)
REDIS_PASSWORD=<valor-gerado>

# Security (use valores gerados)
JWT_SECRET=<valor-gerado>
ENCRYPTION_KEY=<valor-gerado>
ENCRYPTION_SALT=<valor-gerado>

# Backup
BACKUP_SECRET_KEY=<valor-gerado>

# 2FA obrigatório para admins
ENFORCE_2FA_SETUP=true
```

### 3. Configurar SSL/HTTPS

#### Opção A: Let's Encrypt (Recomendado)

```bash
cd backend
chmod +x scripts/init-ssl.sh
./scripts/init-ssl.sh seu-dominio.com seu-email@example.com
```

#### Opção B: Certificado Próprio

Coloque seus certificados em:
- `backend/certbot/conf/live/seu-dominio.com/fullchain.pem`
- `backend/certbot/conf/live/seu-dominio.com/privkey.pem`

### 4. Atualizar Configuração do Nginx

Edite `backend/nginx/nginx.conf`:

```nginx
# Linha 40: Altere o server_name
server_name seu-dominio.com;

# Linha 52: Descomente o redirect HTTPS
location / {
    return 301 https://$host$request_uri;
}

# Linha 103: Altere o server_name
server_name seu-dominio.com;

# Linhas 106-108: Atualize os caminhos dos certificados
ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/seu-dominio.com/chain.pem;
```

### 5. Configurar Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Verificar
sudo ufw status
```

### 6. Configurar Backup Automático

```bash
cd backend
chmod +x scripts/setup-cron-backup.sh
chmod +x scripts/backup-database.sh
./scripts/setup-cron-backup.sh
```

## 🏗️ Deploy

### 1. Build e Start

```bash
cd backend
docker-compose up -d --build
```

### 2. Verificar Status

```bash
# Ver logs
docker-compose logs -f

# Verificar containers
docker-compose ps

# Testar health check
curl http://localhost:3001/health
```

### 3. Executar Migrações

```bash
docker-compose exec api npm run migration:run
```

### 4. Criar Usuário Admin Inicial

```bash
docker-compose exec api npm run seed:admin
```

## 🔒 Pós-Deploy - Hardening

### 1. Verificar Segurança

```bash
# Testar HTTPS
curl -I https://seu-dominio.com

# Verificar headers de segurança
curl -I https://seu-dominio.com | grep -E "Strict-Transport|X-Frame|X-Content"

# Testar rate limiting
for i in {1..10}; do curl https://seu-dominio.com/auth/login; done
```

### 2. Configurar Monitoramento

#### Sentry (Opcional)

```bash
# Adicione ao .env
SENTRY_DSN=https://...@sentry.io/...
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
```

#### New Relic (Opcional)

```bash
# Adicione ao .env
NEW_RELIC_LICENSE_KEY=...
```

### 3. Configurar Alertas

Crie um script de monitoramento:

```bash
# /usr/local/bin/health-check.sh
#!/bin/bash
HEALTH_URL="https://seu-dominio.com/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $RESPONSE -ne 200 ]; then
    echo "⚠️ API Health Check Failed: HTTP $RESPONSE"
    # Enviar alerta (email, Slack, etc)
fi
```

Adicione ao cron:
```bash
*/5 * * * * /usr/local/bin/health-check.sh
```

## 🔄 Atualizações

### Deploy de Nova Versão

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
docker-compose logs -f
curl https://seu-dominio.com/health
```

### Rollback

```bash
# 1. Parar containers
docker-compose down

# 2. Voltar para versão anterior
git checkout <commit-anterior>

# 3. Rebuild
docker-compose up -d --build

# 4. Restaurar backup (se necessário)
# Ver seção "Restaurar Backup"
```

## 💾 Backup e Restore

### Backup Manual

```bash
docker-compose exec api /app/scripts/backup-database.sh
```

### Restaurar Backup

```bash
# 1. Listar backups
ls -lh /backups/

# 2. Descriptografar (se encrypted)
openssl enc -aes-256-cbc -d \
    -in /backups/db_backup_20260224_020000.sql.gz.enc \
    -out backup.sql.gz \
    -k $BACKUP_SECRET_KEY

# 3. Restaurar
gunzip -c backup.sql.gz | docker-compose exec -T db psql -U sst_user -d sst
```

## 🔍 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker-compose logs api

# Verificar variáveis de ambiente
docker-compose exec api env | grep -E "JWT|DATABASE|REDIS"
```

### Erro de conexão com Database

```bash
# Verificar se DB está rodando
docker-compose ps db

# Testar conexão
docker-compose exec db psql -U sst_user -d sst -c "SELECT 1"
```

### Erro de conexão com Redis

```bash
# Verificar se Redis está rodando
docker-compose ps redis

# Testar conexão
docker-compose exec redis redis-cli -a $REDIS_PASSWORD ping
```

### SSL não funciona

```bash
# Verificar certificados
docker-compose exec nginx ls -la /etc/letsencrypt/live/seu-dominio.com/

# Testar configuração do Nginx
docker-compose exec nginx nginx -t

# Recarregar Nginx
docker-compose restart nginx
```

## 📊 Monitoramento

### Métricas Importantes

```bash
# CPU e Memória
docker stats

# Espaço em disco
df -h

# Logs de erro
docker-compose logs api | grep ERROR

# Conexões ativas
docker-compose exec db psql -U sst_user -d sst -c "SELECT count(*) FROM pg_stat_activity"
```

### Logs

```bash
# Logs em tempo real
docker-compose logs -f

# Logs de um serviço específico
docker-compose logs -f api

# Últimas 100 linhas
docker-compose logs --tail=100 api
```

## 🆘 Contatos de Emergência

Em caso de incidente de segurança:

1. **Isolar o sistema**
   ```bash
   docker-compose down
   ```

2. **Preservar evidências**
   ```bash
   docker-compose logs > incident_logs_$(date +%Y%m%d_%H%M%S).txt
   ```

3. **Notificar equipe de segurança**

4. **Documentar o incidente**

5. **Investigar e remediar**

## 📚 Recursos Adicionais

- [Documentação Docker](https://docs.docker.com/)
- [Let's Encrypt](https://letsencrypt.org/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

---

**Última atualização:** 2026-02-24
