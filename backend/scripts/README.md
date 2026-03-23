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

### 💾 dr-backup.ts
Cria backup governado do banco PostgreSQL com manifesto, retenção e trilha local/auditável.

**Uso:**
```bash
# Dry-run seguro
npm run dr:backup:dry-run

# Execução real
npm run dr:backup -- --trigger-source=manual

# Execução real com cópia do artefato para o storage governado
npm run dr:backup -- --trigger-source=manual --upload-to-storage
```

**Recursos:**
- pg_dump em formato custom (`pg_restore`)
- Manifesto JSON por execução
- Retenção configurável
- Separação por ambiente
- Trilha local em JSONL
- Registro em `disaster_recovery_executions`
- Upload opcional do artefato para o storage governado

**Observação operacional:**
- o dry-run gera manifesto e prova do fluxo mesmo sem banco local configurado
- a execução real continua exigindo `pg_dump` e credenciais válidas

**Restaurar backup:**
```bash
npm run dr:restore:dry-run -- --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json
npm run dr:restore -- --execute --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json --target-db-url=postgres://...
```

---

### 🧪 dr-integrity-scan.ts
Executa scanner de consistência entre registry, storage governado, vídeos, anexos e evidências.

**Uso:**
```bash
# Dry-run seguro
npm run dr:scan:dry-run

# Scanner real
npm run dr:scan -- --include-orphans

# Scanner real com verificação de hash
npm run dr:scan -- --include-orphans --verify-hashes
```

**Observação operacional:**
- o scanner real depende de banco/configuração do ambiente acessíveis
- se o bootstrap do app falhar por credenciais locais ou serviços externos indisponíveis, a falha deve ser tratada como limitação real do ambiente

**Detecta pelo menos:**
- documentos no registry sem artefato físico
- hash divergente em documento oficial
- vídeos governados indisponíveis
- anexos governados indisponíveis
- evidências governadas da APR inconsistentes
- órfãos no storage sob os prefixes governados suportados

---

### ♻️ dr-restore.ts
Executa restore seguro com dry-run padrão, bloqueio forte para produção e validação pós-restore.

**Uso:**
```bash
# Dry-run
npm run dr:restore:dry-run -- --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json

# Restore real para ambiente alvo
npm run dr:restore -- --execute --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json --target-db-url=postgres://...
```

**Proteções:**
- não restaura sem manifesto
- dry-run por padrão
- bloqueia produção sem confirmação explícita
- faz validação SQL pós-restore
- pode disparar integrity scan pós-restore

---

### 🛡️ dr-protect-storage.ts
Replica artefatos governados do storage principal para um bucket secundário de recovery.

**Uso:**
```bash
# Dry-run seguro
npm run dr:protect-storage:dry-run

# Execução real
npm run dr:protect-storage -- --execute --trigger-source=manual

# Execução real restrita a uma empresa e forçando overwrite
npm run dr:protect-storage -- --execute --company-id=<uuid> --force-replace
```

**Estratégia implementada:**
- bucket secundário compatível com S3/R2
- preserva a mesma `storage key`
- não sobrescreve por padrão
- registra hash SHA-256 do objeto replicado
- registra execução em `disaster_recovery_executions`

**Variáveis esperadas:**
- `DR_STORAGE_REPLICA_BUCKET`
- `DR_STORAGE_REPLICA_REGION`
- `DR_STORAGE_REPLICA_ENDPOINT`
- `DR_STORAGE_REPLICA_ACCESS_KEY_ID`
- `DR_STORAGE_REPLICA_SECRET_ACCESS_KEY`
- `DR_STORAGE_REPLICA_FORCE_PATH_STYLE`

---

### 🧪 dr-recover-environment.ts
Orquestra o recovery validado em ambiente separado, restaurando o banco alvo e executando scanner pós-restore apontado para o storage escolhido.

**Uso:**
```bash
# Dry-run do fluxo completo
npm run dr:recover-environment:dry-run -- --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json --target-environment=recovery

# Execução real usando storage de réplica
npm run dr:recover-environment -- --execute --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json --target-db-url=postgres://... --target-environment=recovery

# Execução real validando contra o storage primário
npm run dr:recover-environment -- --execute --storage-mode=primary --backup-manifest=output/disaster-recovery/backups/production/database/<backup>/manifest.json --target-db-url=postgres://... --target-environment=staging
```

**O que ele faz:**
- valida que o ambiente alvo é separado do de origem
- chama `dr-restore.ts` em modo real com `--skip-post-restore-scan`
- executa `dr-integrity-scan.ts --include-orphans --verify-hashes`
- aponta o scanner para o bucket de recovery quando `storage-mode=replica`
- registra trilha local e execução auditável do recovery validation

**Proteções:**
- não aceita restore real sem `--execute`
- não aceita restore real no mesmo ambiente por padrão
- continua herdando o bloqueio forte de produção do `dr-restore.ts`
- mapeia `target-environment=recovery|sandbox` para `NODE_ENV=staging`, preservando o rótulo real em `DR_ENVIRONMENT_NAME`

---

### ⏰ setup-cron-backup.sh
Script legado de cron local.

**Status atual:** legado. Prefira `dr-backup.ts` + workflow `.github/workflows/disaster-recovery-backup.yml`.

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
- [ ] Configurar secrets e ativar `.github/workflows/disaster-recovery-backup.yml`
- [ ] Testar `npm run dr:backup -- --trigger-source=manual --upload-to-storage`
- [ ] Testar `npm run dr:protect-storage -- --execute`
- [ ] Testar `npm run dr:restore:dry-run -- --backup-manifest=...`
- [ ] Testar `npm run dr:recover-environment:dry-run -- --backup-manifest=... --target-environment=recovery`
- [ ] Testar `npm run dr:scan -- --include-orphans` em ambiente com banco acessível
- [ ] Verificar que todos os secrets foram alterados
- [ ] Confirmar que `.env` não está no git

---

## 🆘 Suporte

Em caso de problemas:

1. Verificar logs: `docker-compose logs -f`
2. Verificar permissões dos scripts
3. Verificar variáveis de ambiente
4. Consultar `DEPLOYMENT_GUIDE.md`
