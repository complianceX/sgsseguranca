# DR Backup — Checklist de Validação

Workflow: `.github/workflows/disaster-recovery-backup.yml`
Agendamento: diário às 04:00 UTC (`cron: "0 4 * * *"`)
Atualizado: 2026-03-25

Topologia R2 do ciclo atual:
- principal: `sgs-01`
- réplica DR: `sgs-02`
- reserva: `sgs-03`

---

## 1. Configuração de Secrets (GitHub → Settings → Secrets and variables → Actions)

### Secrets obrigatórios (backup falha em silêncio se ausentes)

| Secret | Descrição | Validado? |
|--------|-----------|-----------|
| `DR_BACKUP_DATABASE_URL` | Connection string do banco de produção (Supabase PostgreSQL URL) | ☐ |
| `DR_BACKUP_AWS_ACCESS_KEY_ID` | Access key do bucket S3 primário | ☐ |
| `DR_BACKUP_AWS_SECRET_ACCESS_KEY` | Secret key do bucket S3 primário | ☐ |
| `DR_BACKUP_AWS_BUCKET_NAME` | Nome do bucket S3 primário | ☐ |
| `DR_BACKUP_AWS_REGION` | Região do bucket primário (ex.: `us-east-1`) | ☐ |
| `DR_PLACEHOLDER_JWT_SECRET` | Qualquer string ≥ 32 chars — só para iniciar o app no job | ☐ |
| `DR_PLACEHOLDER_JWT_REFRESH_SECRET` | Qualquer string ≥ 32 chars — diferente do JWT_SECRET | ☐ |

### Secrets opcionais (replicação para bucket secundário)

| Secret | Descrição | Validado? |
|--------|-----------|-----------|
| `DR_STORAGE_REPLICA_ACCESS_KEY_ID` | Access key do bucket de réplica | ☐ |
| `DR_STORAGE_REPLICA_SECRET_ACCESS_KEY` | Secret key do bucket de réplica | ☐ |
| `DR_STORAGE_REPLICA_BUCKET` | Nome do bucket de réplica | ☐ |
| `DR_STORAGE_REPLICA_REGION` | Região do bucket de réplica | ☐ |
| `DR_STORAGE_REPLICA_ENDPOINT` | Endpoint personalizado (ex.: Cloudflare R2) — deixar vazio para AWS padrão | ☐ |

### Variables (GitHub → Settings → Secrets and variables → Actions → Variables)

| Variable | Valor recomendado | Validado? |
|----------|-------------------|-----------|
| `DR_BACKUP_RETENTION_DAYS` | `30` | ☐ |
| `DR_STORAGE_BACKUP_PREFIX` | `backups/` | ☐ |
| `DR_STORAGE_REPLICA_FORCE_PATH_STYLE` | `false` (AWS) / `true` (MinIO, R2) | ☐ |
| `DR_STORAGE_PROTECTION_LIMIT_PER_SOURCE` | ex.: `50` (deixar vazio = sem limite) | ☐ |

### SSL do banco (opcionais — Supabase geralmente requer SSL)

| Secret | Valor | Validado? |
|--------|-------|-----------|
| `DR_BACKUP_DATABASE_SSL` | `true` | ☐ |
| `DR_BACKUP_DATABASE_SSL_ALLOW_INSECURE` | `false` | ☐ |

---

## 2. Validação do Workflow

### 2.1 Execução manual (disparo imediato)
```
GitHub → Actions → "Disaster Recovery Backup" → Run workflow → Branch: main
```
- [ ] Job concluiu com status ✅ (verde)
- [ ] Step "Run governed backup" não imprimiu "skipped"
- [ ] Artifact `disaster-recovery-backup` foi gerado em `backend/output/disaster-recovery`
- [ ] Arquivo de log do artifact contém timestamp e tamanho > 0 bytes

### 2.2 Verificação no bucket S3 primário
- [ ] Acessar bucket `DR_BACKUP_AWS_BUCKET_NAME` no console AWS/R2/MinIO
- [ ] Arquivo de backup presente no prefixo configurado (`DR_STORAGE_BACKUP_PREFIX`)
- [ ] Tamanho do arquivo é compatível com o banco (> 0 bytes, plausível vs tamanho esperado)
- [ ] Timestamp do arquivo condiz com horário de execução

### 2.3 Verificação do bucket de réplica (se configurado)
- [ ] Step "Replicate governed storage to secondary bucket" não imprimiu "skipped"
- [ ] Arquivo replicado presente no bucket secundário com o mesmo conteúdo

### 2.4 Retenção
- [ ] Backups anteriores a `DR_BACKUP_RETENTION_DAYS` dias foram removidos automaticamente
- [ ] Artifact GitHub retido por 30 dias (configurado em `retention-days: 30`)

---

## 3. Teste de Restauração (DR Drill — executar a cada 90 dias)

- [ ] Baixar o último backup do S3
- [ ] Restaurar em banco isolado (não produção):
  ```bash
  # Exemplo com pg_restore ou psql dependendo do formato do backup
  pg_restore -d postgresql://user:pass@localhost:5432/dr_test --clean arquivo_backup
  ```
- [ ] Verificar integridade: contagem de registros em tabelas críticas (`users`, `companies`, `aprs`)
- [ ] Registrar resultado e data: `DR Drill realizado em ____/____/______` — OK / NOK

---

## 4. Alertas (configuração recomendada)

- [ ] Configurar notificação de falha de workflow no GitHub (Settings → Notifications)
- [ ] Ou adicionar step de notificação Slack/e-mail no workflow em caso de falha:
  ```yaml
  - name: Notify on failure
    if: failure()
    run: |
      curl -X POST "${{ secrets.SLACK_WEBHOOK_URL }}" \
        -d '{"text":"❌ DR Backup falhou — verificar Actions"}'
  ```

---

## 5. Comportamento esperado sem secrets configurados

O workflow **não falha** — ele imprime mensagem de skip no GITHUB_STEP_SUMMARY e sai com código 0.
Isso significa que a ausência de secrets passa despercebida sem monitoramento ativo.

**Ação obrigatória:** configurar todos os secrets do item 1 antes do primeiro deploy em produção.

---

## 6. Resultado da última validação

| Data | Executado por | Status | Observações |
|------|---------------|--------|-------------|
| ____/____/______ | | ☐ OK / ☐ NOK | |
