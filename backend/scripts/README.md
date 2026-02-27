# Scripts de Segurança e Manutenção

## 📜 Scripts Disponíveis

### 🔐 generate-secrets.sh
Gera secrets criptograficamente seguros para produção.

**Uso:**
```bash
./scripts/generate-secrets.sh
```

**Saída:**
- JWT_SECRET (64 bytes)
- ENCRYPTION_KEY (32 bytes)
- ENCRYPTION_SALT (16 bytes)
- REDIS_PASSWORD (32 bytes)
- DATABASE_PASSWORD (24 bytes)
- BACKUP_SECRET_KEY (32 bytes)

---

### 🔒 init-ssl.sh
Configura certificados SSL usando Let's Encrypt.

**Uso:**
```bash
./scripts/init-ssl.sh seu-dominio.com seu-email@example.com
```

**Pré-requisitos:**
- Domínio apontando para o servidor
- Porta 80 acessível
- Docker Compose rodando

---

### 💾 backup-database.sh
Cria backup criptografado do banco de dados.

**Uso:**
```bash
# Manual
docker-compose exec api /app/scripts/backup-database.sh

# Automático (via cron)
./scripts/setup-cron-backup.sh
```

**Recursos:**
- Compressão gzip
- Criptografia AES-256-CBC
- Limpeza automática (mantém 30 dias)
- Logs detalhados

**Restaurar backup:**
```bash
# Descriptografar
openssl enc -aes-256-cbc -d \
    -in backup.sql.gz.enc \
    -out backup.sql.gz \
    -k $BACKUP_SECRET_KEY

# Restaurar
gunzip -c backup.sql.gz | psql -h $DB_HOST -U $DB_USER -d $DB_NAME
```

---

### ⏰ setup-cron-backup.sh
Configura backup automático diário às 2h da manhã.

**Uso:**
```bash
./scripts/setup-cron-backup.sh
```

**Verifica:**
```bash
crontab -l
```

**Logs:**
```bash
tail -f /var/log/backup.log
```

---

## 🪟 Nota para Windows

Os scripts são escritos para Linux/Unix. No Windows:

1. **Use WSL2** (recomendado):
   ```bash
   wsl
   cd /mnt/c/caminho/do/projeto
   ./scripts/generate-secrets.sh
   ```

2. **Use Git Bash**:
   ```bash
   bash scripts/generate-secrets.sh
   ```

3. **Execute dentro do container Docker**:
   ```bash
   docker-compose exec api bash /app/scripts/generate-secrets.sh
   ```

---

## 🔧 Permissões

No Linux/Mac, torne os scripts executáveis:

```bash
chmod +x scripts/*.sh
```

No Windows com WSL2:
```bash
wsl chmod +x scripts/*.sh
```

---

## 📋 Checklist de Segurança

Antes de ir para produção:

- [ ] Executar `generate-secrets.sh` e atualizar `.env`
- [ ] Executar `init-ssl.sh` para configurar HTTPS
- [ ] Executar `setup-cron-backup.sh` para backups automáticos
- [ ] Testar `backup-database.sh` manualmente
- [ ] Verificar que todos os secrets foram alterados
- [ ] Confirmar que `.env` não está no git

---

## 🆘 Suporte

Em caso de problemas:

1. Verificar logs: `docker-compose logs -f`
2. Verificar permissões dos scripts
3. Verificar variáveis de ambiente
4. Consultar `DEPLOYMENT_GUIDE.md`
