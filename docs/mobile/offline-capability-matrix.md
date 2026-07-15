# Matriz de capacidades offline por módulo

Esta política é a fonte funcional mínima para a experiência móvel offline. A fonte executável está em `frontend/src/lib/offline-capabilities.ts`; alterações nesta tabela devem atualizar os testes e passar por revisão de segurança.

## Estados

- **read-write**: conteúdo já disponível pode ser lido e o módulo pode registrar alterações na fila offline segura para sincronização posterior.
- **read-only**: conteúdo já carregado pode ser consultado; criação, edição, exclusão, envio e geração remota exigem conexão.
- **online-required**: o módulo depende do servidor. A tela não esconde nem bloqueia conteúdo que já esteja renderizado, mas ações e formulários são interrompidos antes de iniciar trabalho.
- **unsupported**: padrão seguro para rotas sem política explícita. Leitura renderizada não é bloqueada; escrita offline não é permitida.

## Baseline

| Módulo | Identificador | Capacidade offline |
| --- | --- | --- |
| APR | `apr` | read-write |
| PT | `pt` | read-write |
| Checklists | `checklists` | read-write |
| Não conformidades | `nonconformities` | read-write |
| ARR | `arr` | read-only |
| DID | `did` | read-only |
| Sites | `sites` | read-only |
| DDS | `dds` | online-required |
| RDO | `rdo` | online-required |
| Treinamentos | `trainings` | online-required |
| Exames médicos | `medical` | online-required |

`unsupported` não aparece como módulo da baseline: ele é deliberadamente o fallback para qualquer rota ainda não classificada.

## Integração e bloqueio antecipado

`OfflineCapabilityBanner` é instalado uma vez no shell do dashboard. Ele:

1. acompanha os eventos `online` e `offline` do navegador;
2. anuncia a capacidade da rota com uma região acessível (`role="status"`, `aria-live="polite"`);
3. mantém a leitura disponível;
4. em módulos que não são `read-write`, bloqueia submissões de formulário no capture phase, antes do handler da página;
5. bloqueia links para fluxos `/new` e controles explicitamente marcados com `data-online-only="true"` ou `data-offline-action="write"`.

Ações custosas que não usam formulário (upload, exportação remota, assinatura, envio ou geração de PDF no servidor) devem usar um desses atributos no elemento acionador. O atributo é um mecanismo de segurança, não apenas uma indicação visual; páginas podem também desabilitar o controle para melhorar a ergonomia.

## Cache e isolamento de tenant

O service worker usa cache versionado e limitado a `offline.html`, manifesto, ícones, logotipo e assets imutáveis de build do Next.js. Navegações são **network-only**, com `offline.html` como fallback. Não entram no cache:

- respostas de API;
- autenticação e login;
- páginas do dashboard;
- contexto ou cabeçalhos de tenant (`x-company-id`/`x-tenant-id`);
- requisições com `Authorization`;
- URLs com query string e dados dinâmicos do Next.js.

Assim, o cache do service worker é público e independente de tenant. Na troca de empresa, `selectedTenantStore` chama `clearSensitiveBrowserStorage`, que remove cache, fila e sessão do IndexedDB seguro, além de chaves legadas do `localStorage`. Dados offline de um tenant não são reutilizados no tenant seguinte.

## Limites

`navigator.onLine` indica conectividade do dispositivo, não saúde da API. O banner de status da API continua responsável por indisponibilidade do backend. A política não transforma automaticamente módulos `read-write` em offline-first: cada escrita deve continuar usando a fila segura e sanitizada já existente.
