# Guia Publico de Integracao da API SGS para Desenvolvedores

> Este guia publico deve ser usado apenas junto com o Swagger/OpenAPI do ambiente autorizado e com um escopo formal de integracao. Informacoes de infraestrutura, credenciais, permissoes internas, rotas administrativas e detalhes de seguranca operacional nao devem ser compartilhados fora do time SGS.

## 1. Status do Documento

Status: **versao publica sanitizada**.

Este documento foi preparado para desenvolvedores externos que precisam consumir a API SGS em um escopo controlado. Ele nao e uma listagem completa da API, nao substitui o Swagger e nao autoriza acesso a modulos fora do contrato de trabalho.

Legenda:

| Marcacao | Significado |
|---|---|
| Confirmado | Endpoint ou comportamento validado no codigo e elegivel para documentacao externa |
| Exemplo | Exemplo ilustrativo; validar no Swagger antes de usar |
| Validar | Depende do ambiente, usuario, permissao ou contrato de integracao |
| Nao usar | Nao deve ser consumido por terceiros |

## 2. Objetivo

Orientar integracoes externas com a API SGS de forma segura, previsivel e compatvel com multi-tenancy, RBAC, auditoria e LGPD.

O integrador deve usar este guia para:

- autenticar chamadas;
- enviar headers obrigatorios;
- tratar erros;
- respeitar tenant;
- consumir apenas endpoints liberados no escopo;
- evitar vazamento de dados pessoais ou credenciais.

## 3. Escopo Permitido

Permitido:

- consumir endpoints aprovados pelo SGS;
- usar ambiente de staging homologado;
- desenvolver frontend, automacao ou conector dentro do escopo contratado;
- usar o Swagger do ambiente autorizado;
- reportar erros usando `X-Request-ID`.

Nao permitido:

- acessar banco, Redis, filas, storage, logs internos ou infraestrutura;
- receber secrets, `.env`, tokens admin, service keys ou credenciais de producao;
- consumir endpoint fora do escopo;
- manipular tenant por conta propria;
- armazenar token JWT em `localStorage`;
- logar CPF completo, senha, token, cookie, documento sensivel ou assinatura;
- gerar PDF oficial no frontend;
- tentar acessar dados de outro tenant.

## 4. Ambientes

As URLs reais serao fornecidas pelo responsavel SGS.

| Ambiente | Uso | Observacao |
|---|---|---|
| Staging | Desenvolvimento e homologacao | Obrigatorio para integradores externos |
| Producao | Uso final aprovado | Liberado somente apos aceite tecnico |
| Local | Uso interno SGS | Nao entregue como ambiente oficial a terceiros |

Novos clientes devem usar rotas versionadas no formato `/v1/...`.

## 5. Autenticacao

A API usa autenticacao por Bearer Token.

Header:

```http
Authorization: Bearer <accessToken>
```

O fluxo de login e refresh deve seguir o Swagger do ambiente autorizado. Integracoes browser devem respeitar cookies seguros e protecoes CSRF quando aplicavel.

Regras:

- nao armazenar token em `localStorage`;
- nao imprimir token em console/log;
- renovar sessao somente pelo fluxo oficial;
- tratar `401` como sessao invalida, expirada ou contexto ausente.

## 6. Multi-tenant

O SGS e um SaaS multi-tenant. Cada cliente opera em um tenant isolado.

Quando o escopo exigir empresa explicita, o integrador recebera um `companyId` autorizado e devera enviar:

```http
x-company-id: <companyId-autorizado>
```

Regras:

- use somente o `companyId` entregue pelo SGS;
- nunca envie `company_id` ou `tenant_id` no body se o Swagger nao exigir;
- nao tente consultar IDs de outro tenant;
- trate `403` como falta de permissao ou bloqueio de tenant;
- trate `404` como recurso inexistente ou inacessivel.

## 7. Headers

| Header | Obrigatorio | Uso |
|---|---|---|
| `Authorization` | Sim, em rotas protegidas | `Bearer <accessToken>` |
| `x-company-id` | Condicional | Tenant autorizado para a integracao |
| `Content-Type` | Sim em POST/PATCH/PUT JSON | `application/json` |
| `Accept` | Recomendado | `application/json` |
| `X-Request-ID` | Recomendado | Rastreamento de suporte |

## 8. Requisicoes

Padroes:

- JSON em UTF-8 para payloads comuns;
- `multipart/form-data` apenas quando o endpoint do Swagger exigir upload direto;
- datas em ISO 8601;
- UUIDs em formato valido;
- paginação por `page` e `limit` quando documentada no endpoint;
- filtros somente quando documentados no Swagger.

Campos fora do DTO podem ser rejeitados.

## 9. Respostas

Nao assuma um envelope unico para todos os endpoints. A resposta oficial e a do Swagger do ambiente autorizado.

Padroes comuns:

- endpoints de listagem podem retornar paginação;
- endpoints de autenticacao retornam dados de sessao;
- endpoints de arquivo podem retornar URL temporaria, chave governada ou stream;
- operacoes sensiveis podem exigir confirmacao adicional.

## 10. Erros

Formato comum de erro:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Dados invalidos",
  "errorCode": "BAD_REQUEST",
  "error": {
    "code": "BadRequestException",
    "message": "Dados invalidos",
    "details": [],
    "timestamp": "2026-05-01T12:00:00.000Z",
    "path": "/v1/recurso",
    "requestId": "uuid"
  }
}
```

Tratamento esperado:

| Status | Acao |
|---|---|
| 400 | Corrigir payload ou parametros |
| 401 | Renovar sessao ou refazer login |
| 403 | Validar permissao e tenant |
| 404 | Recurso inexistente ou inacessivel |
| 409 | Recarregar estado antes de tentar novamente |
| 429 | Aplicar backoff; nao repetir em loop |
| 500 | Registrar `X-Request-ID` e acionar suporte SGS |

## 11. Endpoints Liberados por Escopo

O SGS deve entregar uma tabela especifica por integracao com:

| Modulo | Metodo | Endpoint | Finalidade | Observacao |
|---|---|---|---|---|
| Validar | Validar | Validar | Validar | Somente endpoints aprovados |

Nao use endpoints descobertos por tentativa, codigo-fonte, historico de commit ou inspecao de frontend. O contrato valido e o conjunto aprovado pelo SGS mais o Swagger do ambiente.

## 12. Exemplos

### Login

Exemplo conceitual. Validar payload no Swagger do ambiente.

```bash
curl -X POST "$BASE_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"cpf":"12345678900","password":"senha"}'
```

### Requisicao autenticada

```ts
const response = await fetch(`${baseUrl}/v1/recurso-autorizado`, {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'x-company-id': companyId,
    Accept: 'application/json',
    'X-Request-ID': crypto.randomUUID(),
  },
});

if (response.status === 401) {
  throw new Error('Sessao expirada');
}

if (response.status === 403) {
  throw new Error('Acesso negado');
}

const data = await response.json();
```

### Upload governado

Use apenas quando o endpoint for liberado no escopo. O fluxo oficial sera descrito no Swagger e pode envolver URL temporaria, validacao server-side, verificacao de tipo real e promocao para storage governado.

Nao envie arquivo diretamente para storage sem URL emitida pela API SGS.

## 13. PDF Oficial

PDF oficial deve ser gerado ou validado pelo backend SGS.

O integrador pode:

- solicitar geracao quando o endpoint estiver liberado;
- baixar documento via rota autorizada;
- anexar arquivo quando o fluxo governado permitir.

O integrador nao pode:

- gerar documento oficial final no frontend como fonte de verdade;
- alterar hash, assinatura, status ou metadados internos;
- armazenar copia oficial fora do ambiente autorizado sem aprovacao.

## 14. LGPD

Obrigatorio:

- coletar somente dados necessarios;
- nao expor CPF completo em logs, query string, URL ou prints;
- nao enviar dados pessoais a terceiros sem autorizacao formal;
- mascarar dados sensiveis em mensagens de erro;
- nao armazenar documentos fora do fluxo aprovado;
- remover dados de teste ao final da homologacao quando solicitado;
- reportar incidentes de seguranca imediatamente.

## 15. Seguranca

Regras minimas:

- usar HTTPS em staging/producao;
- separar credenciais por ambiente;
- aplicar least privilege;
- validar `401`, `403` e `429`;
- evitar retries em operacoes de escrita sem idempotencia aprovada;
- nao incluir secrets em frontend;
- nao commitar arquivos `.env`, chaves privadas ou dumps;
- nao usar usuario administrativo fora do escopo;
- manter logs sem tokens, cookies e PII.

## 16. Checklist Inicial do Integrador

[ ] Recebi URL do ambiente autorizado.
[ ] Recebi usuario de teste limitado.
[ ] Recebi `companyId` autorizado, quando aplicavel.
[ ] Recebi Swagger/OpenAPI.
[ ] Recebi lista fechada de endpoints permitidos.
[ ] Configurei `Authorization`.
[ ] Configurei `x-company-id` quando exigido.
[ ] Nao armazeno JWT em `localStorage`.
[ ] Nao exponho secrets no frontend.
[ ] Trato `401`, `403`, `404`, `429` e `500`.
[ ] Registro `X-Request-ID` em erros.
[ ] Nao envio dados pessoais em query string.

## 17. Checklist de Aceite

[ ] Cada endpoint usado esta no escopo aprovado.
[ ] Metodo HTTP confere com o Swagger.
[ ] Payload confere com o Swagger.
[ ] Response foi testado no staging.
[ ] Tenant foi validado.
[ ] Permissao do usuario de teste foi validada.
[ ] Erros foram tratados.
[ ] Logs nao expoem dados sensiveis.
[ ] Upload, se existir, usa fluxo governado.
[ ] PDF oficial, se existir, usa backend SGS.
[ ] Build passou.
[ ] Testes passaram.
[ ] Revisao de seguranca concluida.

## 18. Pacote de Entrega para Terceiros

O SGS deve entregar somente:

- URL de staging;
- Swagger/OpenAPI do ambiente;
- usuario de teste limitado;
- `companyId` de teste, quando aplicavel;
- endpoints liberados;
- criterios de aceite;
- contato tecnico;
- regra de reporte de incidentes.

Nao entregar:

- `.env`;
- `DATABASE_URL`;
- credenciais de storage;
- tokens admin;
- secrets JWT;
- dumps;
- chaves privadas;
- acesso direto a banco ou filas;
- documentacao interna de seguranca operacional.

## 19. Proximos Passos

1. Definir escopo do modulo do terceiro.
2. Gerar lista fechada de endpoints permitidos.
3. Exportar Swagger do staging.
4. Criar usuario de teste com permissao minima.
5. Testar exemplos no staging.
6. Registrar aceite tecnico e de seguranca antes de producao.
