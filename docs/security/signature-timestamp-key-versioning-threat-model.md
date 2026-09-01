# Threat model — versionamento de chaves de timestamp de assinatura

## Escopo

O boundary cobre o carimbo `internal-hmac-v1`, formado por
`timestamp_issued_at.hmac_hex`, e a rotação futura de chaves usadas para emitir
e verificar tokens. Segredos permanecem somente na configuração privada do
backend; o banco guarda apenas metadata não secreta quando disponível.

## Decisões e invariantes

- Tokens v1 existentes não são reescritos e continuam sem depender de um novo
  envelope. A versão e o `key_id` são metadata persistida para emissões novas;
  registros antigos sem metadata seguem o caminho legado explícito.
- Uma única chave ativa pode emitir tokens. Chaves históricas são
  `verification-only` e nunca são usadas para emissão.
- `LEGACY_KEY_UNAVAILABLE` significa que o token legado está bem formado, mas a
  chave necessária não está disponível; não é convertido em `INVALID`.
- A ausência de chave ativa interrompe a emissão. Não há fallback para JWT,
  chave de criptografia, segredo hardcoded ou tentativa indiscriminada de todas
  as chaves.
- A chave selecionada por metadata é validada por versão, autoridade e
  `key_id`; MACs são comparados com verificação de comprimento e
  `timingSafeEqual`.

## Ameaças e controles

| Ameaça | Controle |
| --- | --- |
| Vazamento de segredo em logs, resposta ou banco | Keyring mantém segredos em memória de configuração; respostas expõem somente estado; sanitização e testes cobrem ausência de valores sensíveis. |
| Confusão entre chave ativa, legada e JWT | IDs reservados, chaves separadas, comprimento mínimo e rejeição de reutilização entre domínios. |
| Downgrade ou versão/autoridade forjada | v1 e `internal-hmac-v1` são exigidos; versão/autoridade inesperadas falham fechado. |
| `key_id` controlado por atacante | O ID somente seleciona uma entrada previamente configurada; IDs desconhecidos são `INVALID`. |
| Ataque de timing no MAC | Comparação após buffers de mesmo tamanho com `timingSafeEqual`. |
| Envelope malformado ou timestamp não canônico | Formato, timestamp UTC, hash e MAC hexadecimal são validados antes da verificação. |
| Perda da chave histórica | Estado derivado `LEGACY_KEY_UNAVAILABLE` permite recuperar a chave depois sem alterar tokens. |
| Erro de rotação | A antiga permanece somente para verificação e a nova é a única de emissão; metadata identifica a chave nova. |
| Trilha forense inconsistente | Token, hash, timestamps e eventos existentes não são recalculados nem sobrescritos. |

## Limites

Este modelo não prova a posse de uma chave histórica perdida nem autoriza sua
provisionamento. A disponibilidade, rotação e revogação dos segredos dependem
do secret store operacional e devem ser validadas no ambiente alvo antes da
ativação.
