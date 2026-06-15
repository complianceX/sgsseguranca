# Relatório Final Consolidado — Frontend SGS Segurança

> Gerado em 2026-06-14 | Auditoria completa: arquitetura, segurança, performance, qualidade, acessibilidade
> Alvo: `app.sgsseguranca.com.br` (produção) | Backend: `api.sgsseguranca.com.br` (522 Cloudflare timeout)

---

## 1. RESUMO EXECUTIVO

**Nível de risco geral: ALTO.** O frontend SGS está em produção com 26 achados (2 críticos, 7 altos, 9 médios, 8 baixos). Os 3 achados mais urgentes são: **(1)** inexistência de `middleware.ts` — qualquer requisição HTTP a `/dashboard/*` recebe o HTML completo mesmo sem autenticação, expondo dados de ASOs (exames médicos), documentos (DDS), dados pessoais de trabalhadores e relatórios de SST a qualquer pessoa que desative JavaScript ou explore SSR; **(2)** SHA-256 calculado via `FileReader.readAsArrayBuffer()` carrega o arquivo inteiro de vídeo (até 500MB) na memória RAM do navegador, causando crash em dispositivos com < 4GB de RAM — perda de DDS com vídeo e retrabalho para o técnico de segurança; **(3)** upload de mídia sem barra de progresso, cancelamento ou retry automático — em redes 4G instáveis de canteiros de obra, uploads de 500MB falham silenciosamente e o usuário só descobre minutos depois. Pontos positivos relevantes: tokens armazenados corretamente (access token em memória, refresh em httpOnly cookie — sem JWT em localStorage), Sentry configurado com scrubbing de CPF e dados médicos, validação Zod espelhada cliente-servidor em APR/PT/DDS, modais com `useFocusTrap` + `aria-labelledby`, e 40+ permissões RBAC tipadas centralizadas.

---

## 2. MAPA DE RISCOS CONSOLIDADO

| # | Achado | Fase | Categoria | Severidade | Esforço (h) | Impacto ao Negócio |
|---|---|---|---|---|---|---|
| 1 | `middleware.ts` inexistente — zero proteção server-side | Segurança | Autenticação | 🔴 Crítico | 8 | Qualquer requisição HTTP a `/dashboard/*` retorna HTML completo sem auth; expõe ASOs, DDS, relatórios SST com JS desabilitado |
| 2 | SHA-256 carrega vídeo de 500MB inteiro na RAM (`FileReader.readAsArrayBuffer`) | Performance | Memória | 🔴 Crítico | 4 | Browser crash em dispositivos < 4GB RAM; upload de DDS perdido, técnico refaz o trabalho em campo |
| 3 | IP do backend hardcoded no proxy fallback (`216.238.104.148`) | Segurança | Configuração | 🟠 Alto | 1 | Falha de env vars expõe IP interno em produção; dificulta migração de infra sem rebuild |
| 4 | Turnstile ausente no forgot-password | Segurança | Bots | 🟠 Alto | 2 | Enumeração de CPF de trabalhadores via força bruta; ataque de credential stuffing contra o sistema |
| 5 | Turnstile ausente no DDS signing público | Segurança | Bots | 🟠 Alto | 2 | Automação de assinatura de DDS; falsificação de documentos de segurança do trabalho em lote |
| 6 | `recharts` ~200KB importado estaticamente em 3 páginas (KPIs, Executivo, RiskMap) | Performance | Bundle | 🟠 Alto | 3 | LCP > 3.5s nas rotas de relatórios gerenciais; bundle de 430KB+ delivery lento em 3G |
| 7 | Upload sem progresso/cancel/retry (até 500MB por vídeo) | Performance | UX | 🟠 Alto | 16 | Upload falha silenciosamente; usuário descobre minutos depois; sem chance de cancelar upload errado |
| 8 | `FormField` não anuncia erro com `role="alert"` | A11y | Screen reader | 🟠 Alto | 1 | Usuário com deficiência visual não sabe que cometeu erro no formulário; risco legal (Lei Brasileira de Inclusão) |
| 9 | Step-up usa `prompt()` no employees (bloqueante) | Segurança | MFA | 🟠 Alto | 2 | `prompt()` bloqueia navegador, usuário pode contornar; deleção de funcionário sem confirmação MFA consistente |
| 10 | Token de assinatura DDS na URL (histórico + referrer) | Segurança | Privacidade | 🟡 Médio | 4 | Token visível no histórico do navegador; qualquer pessoa com acesso ao computador pode reutilizar |
| 11 | `@turf/turf` ~170KB — dependência morta (nunca importada) | Performance | Bundle | 🟡 Médio | 0.5 | 170KB desnecessários em toda build; aumenta tempo de instalação e deploy |
| 12 | Notificações via HTTP polling (15s ativo / 60s inativo) | Performance | Tempo real | 🟡 Médio | 40 | Atraso de até 15s em notificações de aprovação/alerta; não crítico para operação |
| 13 | `noUncheckedIndexedAccess` desativado no tsconfig | Código | Tipagem | 🟡 Médio | 8 | ~30 acessos a índices de array sem checagem `undefined`; possíveis crashes em listas de funcionários |
| 14 | `aria-invalid` não setado no `FormField` | A11y | Screen reader | 🟡 Médio | 2 | Leitor de tela não identifica campo com erro; usuário precisa adivinhar qual campo está inválido |
| 15 | Contraste de cor não verificável (variáveis CSS `color-mix` sem fallback) | A11y | Contraste | 🟡 Médio | 2 | Potencial falha WCAG AA; banners informativos podem ficar ilegíveis para usuários com baixa visão |
| 16 | Painéis de aprovação duplicados entre APR, PT, DDS | Código | Manutenção | 🟡 Médio | 16 | ~1.500 linhas de approval workflow idênticas; bug corrigido em um não replica para os outros |
| 17 | `aria-required` não utilizado em formulários | A11y | Screen reader | 🟢 Baixo | 1 | Apenas `*` visual; aceitável WCAG mas best practice ausente |
| 18 | `: any` em `src/lib/pdf-system/core/pagination.ts` (jspdf GState) | Código | Tipagem | 🟢 Baixo | 1 | Isolado em geração de PDF; sem risco de runtime |
| 19 | `<img>` sem `next/image` em componentes diversos | Performance | Otimização | 🟢 Baixo | 4 | Sem lazy loading nativo nem otimização de formato; impacto marginal |
| 20 | Schema Zod do DDS inline no componente (1730 linhas) | Código | Padrão | 🟢 Baixo | 1 | Schema misturado com lógica de UI; APR e PT têm schema separado, DDS não |
| 21 | Signature canvas inacessível por teclado como opção padrão | A11y | Teclado | 🟢 Baixo | 4 | Fallback textual ("digitar nome") existe mas canvas de assinatura vem primeiro |
| 22 | Token de acesso em memória (variável módulo), não localStorage | Segurança | Token | ✅ OK | — | Imune a XSS persistente; token não sobrevive a refresh da aba (correto) |
| 23 | Refresh token em httpOnly cookie com `Secure` + `SameSite=Strict` | Segurança | Token | ✅ OK | — | Inacessível via JavaScript; melhor prática de armazenamento |
| 24 | `React.memo` aplicado em 20 componentes de tabela/lista | Performance | Render | ✅ OK | — | Previne re-renders em cadeia em tabelas com centenas de linhas |
| 25 | Validação Zod espelhada: schema idêntico no frontend e backend | Código | Validação | ✅ OK | — | Consistência de regras de negócio; erro capturado antes do submit |
| 26 | Modais com `useFocusTrap` + Radix Dialog + `aria-labelledby/describedby` | A11y | Modal | ✅ OK | — | Foco gerenciado, anúncio correto, Escape fecha, foco restaurado ao fechar |

---

## 3. ROADMAP DE CORREÇÕES PRIORIZADO

---

### 🔴 Sprint de Emergência (0–7 dias)

---

#### 1. Criar `middleware.ts` — proteção server-side do dashboard

**O que fazer:** Implementar Next.js Middleware que valida `access_token` ou `refresh_token` (httpOnly cookies) antes de servir qualquer rota `/dashboard/*`. Manter guard client-side como redundância.

**Arquivo:** `frontend/middleware.ts` — **criar novo arquivo**

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/login', '/forgot-password', '/reset-password',
  '/assinar', '/_next', '/favicon.ico',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  const hasRefreshToken = request.cookies.has('refresh_token');
  if (!hasRefreshToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/proxy/:path*'],
};
```

**Tempo:** 8h | **Teste:** `curl --cookie "refresh_token=invalid" http://localhost:3000/dashboard/aprs` → redireciona 302 para `/login`

---

#### 2. Substituir `FileReader.readAsArrayBuffer` por hash com streaming (ou pular em arquivos grandes)

**O que fazer:** Para arquivos > 100MB, pular o hash client-side completamente (delegar ao servidor). Para arquivos menores, usar `Blob.slice()` em chunks de 64KB. Ou remover o hash client-side e calcular apenas no servidor.

**Arquivo:** `frontend/src/services/storageUploadService.ts`

```ts
async function computeFileHash(file: File): Promise<string | null> {
  // Arquivos > 100MB: delegar hash ao servidor
  if (file.size > 100 * 1024 * 1024) {
    return null;
  }

  const CHUNK_SIZE = 64 * 1024;
  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    chunks.push(new Uint8Array(await chunk.arrayBuffer()));
    offset = end;
  }

  const combined = new Uint8Array(
    chunks.reduce((acc, c) => acc + c.byteLength, 0)
  );
  let pos = 0;
  for (const c of chunks) {
    combined.set(c, pos);
    pos += c.byteLength;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

**Tempo:** 4h | **Teste:** Upload de 500MB não deve exceder 650MB de RAM no navegador

---

#### 3. Adicionar Turnstile no forgot-password

**O que fazer:** Integrar `react-turnstile` (ou script nativo) no formulário de forgot-password, exatamente como feito no login. Enviar `turnstileToken` no payload.

**Arquivo:** `frontend/app/(auth)/forgot-password/page.tsx`

```tsx
import { Turnstile } from '@marsidev/react-turnstile';

// Estado:
const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

// JSX antes do botão submit:
<Turnstile
  siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
  onSuccess={(token) => setTurnstileToken(token)}
/>

// Submit:
await authService.forgotPassword({ cpf, turnstileToken });
```

**Tempo:** 2h | **Teste:** Submeter forgot-password sem Turnstile → 403 do backend

---

#### 4. Adicionar Turnstile no DDS signing público

**O que fazer:** Colocar Turnstile no topo do formulário de assinatura pública, antes do checkbox de aceite. Seguir exatamente o padrão do login.

**Arquivo:** `frontend/app/assinar/dds/[token]/page.tsx`

**Tempo:** 2h | **Teste:** Assinar DDS via curl sem token → 403

---

#### 5. Remover IP hardcoded do proxy fallback

**O que fazer:** Substituir a constante `FALLBACK_PRODUCTION_BACKEND_ORIGIN` que contém o IP `216.238.104.148` por um erro explícito se a env var não estiver configurada.

**Arquivo:** `frontend/app/proxy/[...path]/route.ts`

```ts
// ANTES:
const FALLBACK_PRODUCTION_BACKEND_ORIGIN =
  'http://jm4nzz41rkp8bh6zpdqjymi9.216.238.104.148.sslip.io';

// DEPOIS:
const BACKEND_ORIGIN =
  process.env.BACKEND_PROXY_URL ||
  process.env.API_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3011'
    : (() => { throw new Error('BACKEND_PROXY_URL não configurado em produção') })());
```

**Tempo:** 1h | **Teste:** Remover env vars em staging e verificar erro explícito

---

### 🟠 Sprint 1 (7–30 dias)

---

#### 6. Implementar upload com progresso, cancelamento e retry automático

**O que fazer:** Substituir `fetch()` por `XMLHttpRequest` com `upload.onprogress`. Adicionar `AbortController` para cancelamento. Implementar retry exponencial (3 tentativas com backoff 2s, 4s, 8s). Criar hook `useFileUpload` e componente `UploadProgress`.

**Arquivo:** `frontend/src/services/storageUploadService.ts`

```ts
interface UploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
  maxRetries?: number;
}

async function uploadToPresignedUrl(
  url: string,
  file: File,
  options?: UploadOptions
): Promise<void> {
  const maxRetries = options?.maxRetries ?? 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadWithXhr(url, file, options);
    } catch (err) {
      if (options?.signal?.aborted) throw new Error('Envio cancelado');
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

function uploadWithXhr(
  url: string,
  file: File,
  options?: UploadOptions
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        options?.onProgress?.(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Falha de rede'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    options?.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}
```

**Tempo:** 16h | **Arquivos adicional:** `src/hooks/useFileUpload.ts`, `src/components/ui/upload-progress.tsx`

---

#### 7. Aplicar dynamic import no `recharts` nas 3 páginas

**O que fazer:** Extrair os componentes que importam `recharts` para arquivos `*Client.tsx` e importá-los com `next/dynamic`.

**Arquivos:**
- `app/dashboard/kpis/components/KpiCharts.tsx`
- `app/dashboard/executive/components/ExecutiveCharts.tsx`
- `app/dashboard/risk-map/components/RiskMapCharts.tsx`

```tsx
// KpiCharts.tsx
import dynamic from 'next/dynamic';

const DynamicCharts = dynamic(() => import('./KpiChartsClient'), {
  ssr: false,
  loading: () => <Skeleton className="h-64" />,
});

export default function KpiCharts() {
  return <DynamicCharts />;
}
```

**Tempo:** 3h | **Métrica:** Bundle JS de cada página reduz ~200KB

---

#### 8. Adicionar `role="alert"` no FormField

**O que fazer:** Adicionar `role="alert"` ao elemento de erro dentro do `FormField`.

**Arquivo:** `frontend/src/components/ui/form-field.tsx`

```tsx
{error ? (
  <p role="alert" className="text-xs font-medium text-[var(--ds-color-danger)]">
    {error}
  </p>
) : null}
```

**Tempo:** 1h | **Teste:** NVDA anuncia erro ao submeter formulário inválido

---

#### 9. Substituir `prompt()` por modal no step-up do employees

**O que fazer:** Substituir `const code = prompt('Confirmação...')` por `ModalFrame` + campo de input + botão confirmar. Replicar o padrão já usado em `app/dashboard/users/page.tsx`.

**Arquivo:** `frontend/app/dashboard/employees/page.tsx`

**Tempo:** 2h | **Teste:** Step-up abre modal focado, teclado funcional, Escape fecha

---

#### 10. Remover `@turf/turf` do package.json

**O que fazer:** `npm uninstall @turf/turf` e remover entrada do `package.json`.

**Arquivo:** `frontend/package.json`

**Tempo:** 0.5h | **Teste:** Build passa, `node_modules` reduz ~170KB

---

### 🟡 Sprint 2 (30–90 dias)

---

#### 11. WebSocket/SSE para notificações

**O que fazer:** Substituir HTTP polling (15s) por SSE (Server-Sent Events). Manter polling como fallback. Implementar reconexão automática com backoff exponencial.

**Arquivo:** `frontend/src/hooks/useRealtimeNotifications.ts`

**Tempo:** 40h (backend SSE endpoint + frontend EventSource) | **Métrica:** Latência < 1s (hoje: 0–15s)

---

#### 12. Refatorar painéis de aprovação para componente compartilhado

**O que fazer:** Extrair workflow de aprovação (assinatura, timeline de status, validações) de APR, PT, DDS para `useApprovalWorkflow` + `ApprovalPanel`.

**Arquivos:** `AprForm.tsx`, `PtForm.tsx`, `DdsForm.tsx` (total ~1.500 linhas de approval)

**Tempo:** 16h | **Métrica:** 1 implementação vs 3 hoje

---

#### 13. Ativar `noUncheckedIndexedAccess` e corrigir erros

**O que fazer:** Adicionar `"noUncheckedIndexedAccess": true` no tsconfig e corrigir ~30 erros de compilação.

**Arquivo:** `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Tempo:** 8h | **Métrica:** 0 erros de compilação pós-ativação

---

#### 14. Adicionar `aria-invalid` no FormField

**O que fazer:** Propagar `aria-invalid` e `aria-describedby` para o input filho quando houver erro.

**Arquivo:** `frontend/src/components/ui/form-field.tsx`

```tsx
const childWithAria = Children.map(children, (child) => {
  if (isValidElement(child)) {
    return cloneElement(child as ReactElement, {
      'aria-invalid': error ? 'true' : undefined,
      'aria-describedby': error ? `${htmlFor}-error` : undefined,
    });
  }
  return child;
});
```

**Tempo:** 2h | **Teste:** `<input aria-invalid="true">` no DOM quando `error` não é vazio

---

#### 15. Redesenhar fluxo de assinatura DDS (token da URL para header/cookie)

**O que fazer:** Backend deve emitir link com token curto + sessão efêmera. Alternativa: enviar código por email e buscar DDS por ID.

**Tempo:** 4h análise + 8h backend + 4h frontend | **Métrica:** Token nunca aparece na URL

---

### 🟢 Backlog (90+ dias)

| # | Ação | Arquivo | Esforço |
|---|---|---|---|
| 16 | Verificar contraste de cor (WCAG AA) nos tokens CSS | `login.module.css`, design tokens | 2h |
| 17 | Adicionar `aria-required` nos FormFields com `required=true` | `form-field.tsx`, `DdsForm.tsx` | 1h |
| 18 | Substituir `: any` por tipo concreto no pdf pagination | `src/lib/pdf-system/core/pagination.ts` | 1h |
| 19 | Substituir `<img>` por `next/image` em componentes | grep por `<img` no frontend | 4h |
| 20 | Extrair schema Zod do DDS para `ddsForm.schema.ts` | `src/lib/validation/ddsForm.schema.ts` (novo) | 1h |
| 21 | Mover texto ("digitar nome") como opção padrão de assinatura | `SignatureModal` | 4h |
| 22 | Adicionar `aria-describedby` na descrição do FormField | `form-field.tsx` | 1h |

---

## 4. MÉTRICAS DE SUCESSO POR CATEGORIA

### Segurança

- [ ] **`middleware.ts` existe** e bloqueia `/dashboard/*` sem cookie httpOnly válido
- [ ] **0 IPs ou secrets** hardcoded no código fonte (IP `216.238.104.148` removido)
- [ ] **Turnstile presente em 100% das rotas públicas:** login ✅, forgot-password, DDS signing
- [ ] **Step-up acionado** antes de: aprovar PT, fechar NC, deletar funcionário, trocar tenant como admin geral
- [ ] **0 chamadas a `prompt()`** em fluxos de segurança (substituído por modal em employees)
- [ ] **Token de assinatura DDS** nunca aparece na URL do navegador

### Performance

- [ ] **Bundle inicial `/dashboard` < 200KB** (hoje: ~430KB com `recharts` + `@turf/turf`)
- [ ] **Upload 500MB:** progresso visível em < 1s, retry automático (3 tentativas), cancelamento funcional
- [ ] **Hash SHA-256 não excede 650MB de RAM** para arquivos de 500MB
- [ ] **Notificações em tempo real:** latência < 1s (WebSocket/SSE) vs atual 0–15s (polling)
- [ ] **LCP < 2.5s** nas rotas: `/dashboard`, `/dashboard/aprs`, `/dashboard/dds`, `/dashboard/kpis`
- [ ] **`@turf/turf` removido** de `package.json` e `node_modules`

### Código

- [ ] **0 ocorrências de `: any`** em arquivos de produção (hoje: 1 em `pagination.ts`)
- [ ] **`noUncheckedIndexedAccess: true`** ativado e compilação limpa
- [ ] **Hook de aprovação compartilhado:** 1 implementação (hoje: 3× duplicadas, ~1.500 linhas)
- [ ] **Schema Zod do DDS** extraído para `src/lib/validation/ddsForm.schema.ts`

### Acessibilidade (WCAG 2.1 AA)

- [ ] **`FormField` anuncia erro** via `role="alert"` — leitores de tela notificam imediatamente
- [ ] **`aria-invalid` setado** em campos com erro de validação
- [ ] **Assinatura DDS:** alternativa textual ("digitar nome") disponível e apresentada como opção **padrão**
- [ ] **`aria-required` presente** em campos obrigatórios
- [ ] **Contraste de cor ≥ 4.5:1** verificado e corrigido em todos os componentes de login
- [ ] **`aria-describedby`** ligando descrição ao input no `FormField`

---

## 5. TOP 3 AÇÕES PARA COMEÇAR HOJE

| # | Ação | Arquivo | Tempo | Resultado Esperado |
|---|---|---|---|---|
| 1 | **Criar `middleware.ts`** que bloqueia `/dashboard/*` sem cookie | `frontend/middleware.ts` (novo) | 8h | Server-side auth enforcement; HTML do dashboard não é servido sem autenticação |
| 2 | **Remover hash client-side** para arquivos > 100MB no upload service | `frontend/src/services/storageUploadService.ts` | 4h | Browser não crasha mais com uploads de 500MB em dispositivos com pouca RAM |
| 3 | **Adicionar Turnstile** no forgot-password e DDS signing público | 2 arquivos (forgot-password + DDS signing) | 4h | Bloqueia enumeração de CPF e falsificação automatizada de DDS |

---

## 6. O QUE ESTÁ BEM (não tocar agora)

| Item | Localização | Motivo |
|---|---|---|
| **Token storage:** access token em variável de módulo (memória), refresh token em httpOnly cookie com `Secure` + `SameSite=Strict` | `frontend/src/lib/api.ts` | Imune a XSS persistente; JWT nunca vai para localStorage |
| **Sentry scrubbing:** CPF mascarado como `[CPF]`, dados médicos como `[REDACTED]` | Configuração Sentry (`.vercel.production.env`) | Conformidade com LGPD; dados sensíveis não vazam para logs de erro |
| **Draft sanitizer:** `clearSensitiveBrowserStorage()` chamado no logout, `sensitive-draft-sanitizer.ts` limpa `localStorage` | `frontend/src/lib/sensitive-draft-sanitizer.ts` | Rascunhos sensíveis (PT, APR) não persistem após logout |
| **Validação Zod espelhada:** schemas idênticos no frontend e backend (APR, PT, DDS, DID) | `frontend/src/lib/validation/` | Consistência de regras; erro capturado antes do roundtrip ao servidor |
| **Modais:** `ModalFrame` usa `@radix-ui/react-dialog` com `useFocusTrap`, `aria-labelledby`, `aria-describedby` | `frontend/src/components/ui/modal-frame.tsx` | Foco gerenciado, anúncio correto, Escape fecha, foco restaurado |
| **RBAC:** 40+ permissões tipadas centralizadas em `Permission` enum | `frontend/src/lib/permissions.ts` | Role guards consistentes e tipados, sem strings mágicas |
| **MFA:** TOTP + QR code + recovery codes completos no login | `frontend/app/(auth)/login/` | 2FA funcional; QR code e recovery codes implementados |
| **`React.memo`:** 20 componentes de tabela/lista memoizados | Diversos (PtsTableRow, UsersTableRow, RisksTableRow, etc.) | Previne re-renders em cadeia em listas com centenas de itens |
| **Polling adaptativo:** 15s ativo / 60s inativo com `setTimeout` encadeado | `frontend/src/hooks/useRealtimeNotifications.ts` | Não acumula requisições; respeita bateria em background |
| **CSRF double-submit:** token custom header + cookie | `frontend/src/lib/api.ts` | Proteção CSRF sem estado de servidor |
| **Cache LRU:** `useCachedFetch` com TTL 180s stale-while-revalidate | `frontend/src/hooks/useCachedFetch.ts` | Reduz chamadas repetidas ao backend no mesmo tenant |
| **`extractApiErrorMessage`:** tratamento padronizado de erros da API | `frontend/src/lib/error-handler.ts` | Mensagens de erro consistentes em todo o app |

---

## Anexo: Estimativa de Esforço Total

| Sprint | Itens | Horas |
|---|---|---|
| 🔴 Emergência (0–7d) | 5 | 17h |
| 🟠 Sprint 1 (7–30d) | 5 | 22.5h |
| 🟡 Sprint 2 (30–90d) | 5 | 78h |
| 🟢 Backlog (90d+) | 7 | 14h |
| **Total** | **22 correções** | **~131.5h** |

> **Nota:** Backend `api.sgsseguranca.com.br` retorna 522 (Cloudflare timeout — Vultr desligado). Itens 11 (WebSocket), 15 (token DSS efêmero) e step-up dependem do backend online para validação completa. Os itens da Sprint de Emergência e Sprint 1 são puramente frontend e podem ser implementados e testados com mock.
