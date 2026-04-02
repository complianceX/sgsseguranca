# Topologia R2 — Produção

## Buckets
- `sgs-01`: bucket principal da aplicação
- `sgs-02`: bucket secundário de réplica para disaster recovery
- `sgs-03`: bucket reservado, sem uso pelo runtime neste ciclo

## Estado suportado pelo código atual
- 1 bucket principal ativo via `AWS_*` / `AWS_S3_*`
- 1 bucket secundário de réplica DR via `DR_STORAGE_REPLICA_*`
- não existe roteamento nativo para distribuir tipos de artefato entre 3 buckets ativos diferentes

## Env do bucket principal
```env
AWS_BUCKET_NAME=sgs-01
AWS_ENDPOINT=https://<account>.r2.cloudflarestorage.com
AWS_REGION=auto
AWS_ACCESS_KEY_ID=REDACTED
AWS_SECRET_ACCESS_KEY=REDACTED
S3_FORCE_PATH_STYLE=true
```

## Env da réplica DR
```env
DR_STORAGE_REPLICA_BUCKET=sgs-02
DR_STORAGE_REPLICA_ENDPOINT=https://<account>.r2.cloudflarestorage.com
DR_STORAGE_REPLICA_REGION=auto
DR_STORAGE_REPLICA_ACCESS_KEY_ID=<access_key>
DR_STORAGE_REPLICA_SECRET_ACCESS_KEY=<secret_key>
DR_STORAGE_REPLICA_FORCE_PATH_STYLE=true
```

## Ordem segura de cutover
1. Inventariar o bucket principal atual com `npm run storage:bucket-cutover:dry-run`
2. Copiar todos os objetos para `sgs-01` preservando as mesmas keys
3. Validar contagem, amostras de leitura e relatório JSON
4. Trocar as envs de produção do bucket principal para `sgs-01`
5. Executar `npm run dr:protect-storage:dry-run`
6. Executar `npm run dr:recover-environment:dry-run`
7. Só considerar o storage fechado quando principal e réplica estiverem válidos

## Rollback operacional
- restaurar as envs anteriores do bucket principal
- manter `sgs-01` apenas como cópia preparada
- não apagar o bucket antigo até validar leitura de artefatos novos e antigos em produção
