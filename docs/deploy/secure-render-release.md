# Release seguro no Render

## Migrations

O serviço `sgs-backend-web` não executa migrations no `preDeployCommand`.
Migrations de produção devem rodar pelo serviço separado `sgs-migrations`, com
`DATABASE_MIGRATION_URL` configurada para a role owner/DDL. O runtime web deve
usar apenas `DATABASE_URL` da role sem `BYPASSRLS`.

Fluxo esperado:

1. Validar CI, testes e revisão do PR.
2. Rodar `sgs-migrations` manualmente no Render quando a release exigir schema.
3. Confirmar sucesso do job e health do banco.
4. Promover/deployar `sgs-backend-web` e `sgs-backend-worker`.

## ClamAV

Uploads governados dependem de `ANTIVIRUS_PROVIDER=clamav` em produção e devem
falhar fechado quando o scanner estiver indisponível. O blueprint declara o
private service `sgs-clamav-internal` e o backend aponta para:

- `CLAMAV_HOST=sgs-clamav-internal`
- `CLAMAV_PORT=3310`

Precisa confirmar no painel Render após aplicar o blueprint:

- private service `sgs-clamav-internal` criado e saudável;
- endpoint `/ready` retornando 200;
- backend e worker na mesma rede privada do serviço;
- logs de upload bloqueando com 503 quando ClamAV estiver indisponível.
