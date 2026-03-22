# Modulos e Regras Importantes

## Regras de governanca que valem como padrao

Estas sao algumas regras que ja foram fortalecidas no sistema e devem ser preservadas:

- backend e a autoridade final
- documentos fechados nao devem aceitar edicao comum
- PDF final governado tem contrato explicito de disponibilidade
- trilha forense append-only deve registrar eventos criticos
- tenant/company scoping nao pode ser perdido
- storage deve ser governado, sem caminho local improvisado como contrato funcional

## Lock / read-only

Em modulos documentais mais maduros, o padrao atual e:

- frontend mostra estado read-only e bloqueia interacoes comuns
- backend reforca o lock de dominio
- se o documento foi aprovado ou recebeu PDF final, a edicao comum nao deve continuar
- quando existe excecao legitima, ela precisa ser explicita, auditavel e pequena

### Exemplo importante

APR ja recebeu endurecimento forte:

- lock no frontend
- lock no backend
- teste automatizado cobrindo o lock
- `createNewVersion` continua sendo o caminho legitimo para evolucao apos fechamento

## Importacao documental

O fluxo foi endurecido para sair do caminho sincronico fragil.

Pontos importantes:

- processamento assincrono
- status consultavel
- retry controlado
- timeout
- estado de falha previsivel
- idempotencia formal
- transicoes mais atomicas
- cleanup e compensacao de storage mais explicitos

## Videos governados

Nesta rodada, video ficou restrito a:

- DDS
- RDO
- Relatorio de Inspecao

Nao deve aparecer nem funcionar em:

- APR
- PT
- CAT
- Checklist
- Nao Conformidade
- outros modulos fora do recorte

Regras principais do video:

- upload com validacao de MIME e tamanho
- metadados persistidos
- URL assinada de acesso, com fallback explicito controlado
- trilha de upload, acesso e remocao
- backend valida lock e permissao

## Assinatura e evidencia

O sistema diferencia:

- aceite operacional
- assinatura verificavel server-side
- fluxos legados, quando ainda existirem

Assinatura forte nao deve depender de hash arbitrario vindo do cliente.

## Emails documentais

Padrao atual:

- prioridade para documento final governado, quando existir
- fallback local so quando explicitamente permitido
- fallback deve ser auditavel

## UI atual

Direcao visual recente:

- fundo branco dominante
- linguagem enterprise
- menos peso visual
- maior consistencia em sidebar, topbar, cards, formularios e tabelas
