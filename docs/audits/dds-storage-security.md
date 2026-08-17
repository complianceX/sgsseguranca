# DDS Storage Security Evidence

Data: 2026-08-16. Ambiente isolado de testes, objetos sintéticos e sem credenciais/valores secretos expostos.

## Evidência confirmada

- A VPS usa volume Docker privado para documentos (`sgs-loadtest-documents`) e `LOCAL_DOCUMENT_STORAGE_DIR`; não foram encontrados parâmetros ativos de S3/B2/R2 no ambiente inspecionado.
- Objetos existentes no container API estavam sob o volume privado e não foram tratados como publicamente acessíveis.
- Download sem autenticação em `/storage/download/not-a-real-token` retornou HTTP `401`.
- Objeto DDS/PDF sintético do tenant A foi registrado e acessado por grant no container efêmero com `DOCUMENT_DOWNLOAD_TOKEN_SECRET` sintético: rota assinada emitida, acesso autorizado `200 ready`, download autorizado `200` com header `%PDF-`, token adulterado `403`, grant expirado `403`, replay após consumo `403`.
- A consulta do tenant A ao registro do tenant B retornou `200 not_emitted`, sem URL/token; o endpoint usa concealment semântico em vez de `403` nesse caso.
- Não existe endpoint explícito de revogação pré-consumo. O controle compensatório é TTL curto, vínculo ao usuário, lock/`consumed_at` transacional e negação após consumo.

## Não confirmado

Não foi provada ACL de provider externo: a VPS está em modo `LOCAL_DOCUMENT_STORAGE_DIR`, volume Docker privado, sem S3/B2/R2 ativo. Também não foi provada revogação administrativa antes do consumo; o teste cobre a compensação por consumo único.

Os arquivos observados no volume tinham modo Unix `0644`. Isso não os torna públicos dentro do volume Docker, mas merece hardening de least privilege antes de uma aprovação definitiva.

**Estado:** `PASS application-level / BLOCKED provider`; não é evidência suficiente para aprovar storage externo ou ACL de produção.
