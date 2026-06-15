# Auditoria de Qualidade — Novos Arquivos Frontend SGS

**Data:** 2026-06-15
**Escopo:** 6 arquivos recém adicionados ao frontend
**Branch:** fix/otel-prometheus-port-collision

---

## Resumo Executivo

| Severidade | Qtd |
|---|---|
| Critico | 3 |
| Alto | 7 |
| Médio | 8 |
| Baixo | 7 |
| **Total** | **25** |

---

## Tabela de Achados

| # | Arquivo | Linha | Severidade | Esforço | Problema |
|---|---|---|---|---|---|
| 1 | `badge.test.tsx` | 1 | Critico | Baixo | Import corrompido — teste não compila |
| 2 | `button.test.tsx` | 1 | Critico | Baixo | Import corrompido — teste não compila |
| 3 | `input.test.tsx` | 1 | Critico | Baixo | Import corrompido — teste não compila |
| 4 | `ssrf.ts` | 174 | Alto | Baixo | `Math.random()` em geração de token de segurança |
| 5 | `ssrf.ts` | 24–31 | Alto | Médio | `ipv6ToInt` definido mas nunca usado; cobertura IPv6 incompleta |
| 6 | `ssrf.ts` | 95–115 | Alto | Alto | DNS rebinding não mitigado — valida string, não IP resolvido |
| 7 | `reset-password/[token]/page.tsx` | 11–43 | Alto | Médio | Rate limit em localStorage bypassável por qualquer usuário |
| 8 | `reset-password/[token]/page.tsx` | 63–79 | Alto | Baixo | `sanitizeBackendMessage` duplicado em dois arquivos |
| 9 | `optimize-auth-imports.cjs` | 56–58 | Alto | Médio | Skip baseado em `content.includes()` causa falso-negativo silencioso |
| 10 | `optimize-auth-imports.cjs` | 61 | Alto | Baixo | Pattern de import com caminho hardcoded pode não cobrir variações |
| 11 | `reset-password/[token]/page.tsx` | 305–333 | Médio | Baixo | Token em URL path — visível em logs de servidor e proxies |
| 12 | `rate-limiter.ts` | 39–53 | Médio | Médio | Flag `locked` é simétrico mas não atômico — ilusão de thread-safety |
| 13 | `rate-limiter.ts` | 13–22 | Médio | Baixo | Map nunca encolhe se `cleanup()` nunca for chamado após burst |
| 14 | `rate-limiter.ts` | 62–73 | Médio | Baixo | `rateLimitHeaders` conta uma requisição extra ao invocar `checkRateLimit` |
| 15 | `ssrf.ts` | 13–18 | Médio | Baixo | `IPV6_PRIVATE_RANGES` declarado mas nunca usado no código de validação |
| 16 | `ssrf.ts` | 169–171 | Médio | Baixo | Evicção de token por posição (FIFO de Map) em vez de por expiração |
| 17 | `reset-password/[token]/page.tsx` | 204–212 | Médio | Baixo | Inputs de senha sem `autocomplete` — gerenciadores de senha não funcionam |
| 18 | `reset-password/[token]/page.tsx` | 200–269 | Médio | Baixo | Campos de senha sem `aria-describedby` apontando para mensagens de erro |
| 19 | `cpf.ts` | 13–17 | Médio | Baixo | `maskCpf` expõe os 2 últimos dígitos — minimizar para `***.***.***-**` |
| 20 | `rate-limiter.ts` | 1 | Baixo | Baixo | `WINDOW_MS` e `CLEANUP_INTERVAL_MS` iguais — coincidência frágil |
| 21 | `optimize-auth-imports.cjs` | 81 | Baixo | Baixo | `indent` extraído da linha de `const` pode falhar com comentários inline |
| 22 | `optimize-auth-imports.cjs` | 96 | Baixo | Baixo | Sem backup do arquivo antes de sobrescrever — destruição silenciosa |
| 23 | `badge.test.tsx` | 12 | Baixo | Baixo | Teste verifica classe interna de design token — frágil a renomeações |
| 24 | `reset-password/[token]/page.tsx` | 278–300 | Baixo | Baixo | Botão de submit sem `aria-describedby` ligado ao indicador de força |
| 25 | `ssrf.ts` | 90–93 | Baixo | Baixo | `isAllowedProxyPath` não normaliza `path` (trailing slash, case) |

---

## Detalhamento por Achado

---

### 1–3 | Imports corrompidos nos testes de UI

**Arquivos:** `badge.test.tsx:1`, `button.test.tsx:1`, `input.test.tsx:1`
**Severidade:** Critico | **Esforço:** Baixo

**Problema:**

A linha 1 dos três testes contém um import sintaticamente inválido:

```ts
// estado atual (INVÁLIDO — mistura aspas duplas com aspas simples e tem placeholder de template)
import { render, screen } from "@/$(Match.1)esting-library/react';
```

O path `@/$(Match.1)esting-library/react` é um artefato de substituição de regex mal-executada (provavelmente `@testing-library/react` foi processado por um script de transformação de alias que capturou o `t` do prefixo). O arquivo não compilará e todos os testes falharão.

**Correção:**

```ts
// badge.test.tsx linha 1
import { render, screen } from '@testing-library/react';

// button.test.tsx linha 1
import { render, screen, fireEvent } from '@testing-library/react';

// input.test.tsx linha 1
import { render, screen, fireEvent } from '@testing-library/react';
```

O alias `@testing-library` não é padrão no tsconfig do projeto (modal-frame.test.tsx usa o path direto `'@testing-library/react'`). Usar o mesmo padrão dos demais testes existentes.

---

### 4 | `Math.random()` em geração de token de segurança

**Arquivo:** `ssrf.ts:174`
**Severidade:** Alto | **Esforço:** Baixo

**Problema:**

```ts
const raw = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
```

`Math.random()` não é criptograficamente seguro. Em ambientes onde `TokenValidator.registerToken` é usado para gerar tokens de autorização, um atacante pode prever os valores se obtiver outros tokens gerados no mesmo processo (o estado do PRNG é de 64 bits e pode ser deduzido com ~2^32 amostras). Além disso, passar por `createHash('sha256')` não acrescenta entropia — só ofusca.

**Correção:**

```ts
import { createHash, randomBytes } from 'node:crypto';

static registerToken(prefix: string, expiryMs: number): string {
  this.cleanup();

  if (this.validTokens.size >= this.MAX_TOKENS) {
    const oldestKey = this.validTokens.keys().next().value;
    if (oldestKey) this.validTokens.delete(oldestKey);
  }

  // randomBytes(16) = 128 bits de entropia criptográfica
  const raw = `${prefix}-${Date.now()}-${randomBytes(16).toString('hex')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const token = `${prefix}_${hash.slice(0, 32)}`; // 32 hex = 128 bits efetivos
  const expiry = Date.now() + expiryMs;

  this.validTokens.set(token, expiry);
  return token;
}
```

---

### 5 | `ipv6ToInt` definido mas nunca chamado; `IPV6_PRIVATE_RANGES` sem uso

**Arquivo:** `ssrf.ts:13–31`
**Severidade:** Alto | **Esforço:** Médio

**Problema:**

```ts
// Declarado mas nunca referenciado
const IPV6_PRIVATE_RANGES = ['fc00::/7', 'fe80::/10', '::1/128', '::/128'];

// Definido mas nunca chamado em isPrivateIPv6
function ipv6ToInt(ip: string): number { ... }
```

`isPrivateIPv6` faz comparação de strings lexicográficas em vez de usar a função numérica. Isso funciona por acidente para os ranges declarados, mas a constante `IPV6_PRIVATE_RANGES` é dead code que gera falsa sensação de cobertura e não é testada.

Adicionalmente, `ipv6ToInt` trunca o endereço a 32 bits (lê apenas os primeiros 4 grupos), o que tornaria comparações numéricas incorretas para endereços com `::` em posições variáveis.

**Correção:**

Remover `ipv6ToInt` e `IPV6_PRIVATE_RANGES` (dead code). Documentar explicitamente que `isPrivateIPv6` usa comparação lexicográfica com padding e adicionar um comentário explicando por que isso é correto para os ranges cobertos:

```ts
/**
 * Verifica se um endereço IPv6 é privado/local.
 * Usa comparação lexicográfica com padding de 4 chars por grupo.
 * Correto para: ULA (fc00::/7), link-local (fe80::/10), loopback (::1), unspecified (::).
 */
function isPrivateIPv6(hostname: string): boolean {
  if (isIP(hostname) !== 6) return false;
  const normalized = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (normalized === '::1' || normalized === '::') return true;
  // Expansão parcial não cobre '::' em posições arbitrárias — aceitar apenas endereços já expandidos
  const groups = normalized.split(':');
  if (groups.includes('')) return false; // endereço comprimido não suportado por esta função
  const padded = groups.map(p => p.padStart(4, '0')).join(':');
  return (padded >= 'fc00:' && padded <= 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') ||
         (padded >= 'fe80:' && padded <= 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff');
}
```

---

### 6 | DNS rebinding não mitigado

**Arquivo:** `ssrf.ts:95–115`
**Severidade:** Alto | **Esforço:** Alto

**Problema:**

`validateTargetUrl` valida o hostname como string antes de qualquer resolução DNS. Um atacante pode registrar `evil.example.com` que aponta para `192.168.1.1` — a validação passa porque o hostname é um nome de domínio público, mas a requisição chega ao endereço privado. Esta é a principal vulnerabilidade SSRF em proxies.

O frontend não resolve DNS por si (isso ocorre no runtime Node.js/Fetch), portanto a validação precisa ser arquitetural:

**Correção de curto prazo** — Restringir o ALLOWED_PROXY_PATHS ao mínimo e adicionar comentário explícito documentando a limitação:

```ts
/**
 * NOTA DE SEGURANÇA: validateTargetUrl valida o hostname como string,
 * não o IP resolvido. DNS rebinding permanece possível para domínios
 * externos. Este guard é uma defesa em profundidade, não uma solução completa.
 *
 * Mitigação arquitetural recomendada: usar um proxy reverso (Cloudflare/Nginx)
 * que não passe requisições a IPs privados, ou resolver o hostname no servidor
 * antes de fazer o fetch (requer `dns.lookup` explícito antes do `fetch`).
 */
```

**Correção de longo prazo** — No route handler do proxy Next.js, resolver o DNS antes do fetch:

```ts
import { lookup } from 'node:dns/promises';

async function resolveAndValidate(hostname: string): Promise<boolean> {
  try {
    const { address } = await lookup(hostname);
    return !isPrivateIP(address);
  } catch {
    return false; // falha de DNS → rejeitar
  }
}
```

---

### 7 | Rate limit em localStorage é bypassável

**Arquivo:** `reset-password/[token]/page.tsx:11–43`
**Severidade:** Alto | **Esforço:** Médio

**Problema:**

O contador de tentativas é armazenado em `localStorage`. Basta abrir uma aba anônima, limpar o storage ou desabilitar o JavaScript para zerar o limite. A proteção real contra brute force deve estar no backend (e ao que parece, já está — o backend retorna 429). O rate limit client-side é apenas UX, não segurança.

O problema é que o código usa linguagem de segurança ("bloqueio temporário", "muitas tentativas") em uma defesa que não tem garantia de enforcement.

**Correção:**

Manter o rate limit client-side como UX (feedback imediato ao usuário) mas remover a ilusão de segurança:

```ts
// Renomear para deixar claro que é UX, não enforcement de segurança
const UX_ATTEMPTS_KEY = 'reset_password_ux_attempts';

// Comentar explicitamente
/**
 * Rate limiting client-side apenas para UX (evitar múltiplos cliques).
 * O enforcement real de rate limiting está no backend (HTTP 429).
 * localStorage pode ser limpo — não confiar para segurança.
 */
```

Adicionalmente, a variável `RESET_WINDOW_MS` referencia 15 minutos mas o texto da UI diz "Aguarde 15 minutos" como mensagem hardcoded (linha 145). Se `RESET_WINDOW_MS` mudar, a mensagem ficará desatualizada:

```ts
// Correção: calcular dinamicamente
const remainingMinutes = Math.ceil(RESET_WINDOW_MS / 60_000);
setAttemptError(`Muitas tentativas. Aguarde ${remainingMinutes} minutos.`);
```

---

### 8 | `sanitizeBackendMessage` duplicado em dois arquivos

**Arquivos:** `reset-password/[token]/page.tsx:63–79`, `reset-password/page.tsx:29–46`
**Severidade:** Alto | **Esforço:** Médio

**Problema:**

A função `sanitizeBackendMessage` é idêntica em ambos os arquivos (cópia literal). Se uma mensagem conhecida precisar ser adicionada ao dicionário `known`, ambos os arquivos terão de ser editados. Há risco de divergência silenciosa.

**Correção:**

Extrair para um utilitário compartilhado:

```ts
// frontend/src/lib/auth/sanitize-backend-message.ts
export function sanitizeBackendMessage(msg: unknown): string {
  if (typeof msg !== 'string' || !msg.trim()) return 'Ocorreu um erro. Tente novamente.';
  if (/[a-z]{3,}/.test(msg) && !/[àáâãéêíóôõúüç]/i.test(msg) && msg.length > 60) {
    return 'Ocorreu um erro. Tente novamente.';
  }
  const known: Record<string, string> = {
    'password must be longer than or equal to 8 characters': 'A senha deve ter no mínimo 8 caracteres.',
    'password is too weak': 'A senha é muito fraca. Use letras maiúsculas, minúsculas e números.',
    'token expired': 'O link expirou. Solicite um novo link de redefinição.',
    'invalid token': 'Link inválido. Solicite um novo link de redefinição.',
  };
  const lower = msg.toLowerCase();
  for (const [key, value] of Object.entries(known)) {
    if (lower.includes(key)) return value;
  }
  return msg;
}
```

Similarmente, `getPasswordStrength` e `strengthLabel` também são duplicados entre os dois arquivos de reset-password.

---

### 9 | Script de migração: skip silencioso com falso-negativo

**Arquivo:** `optimize-auth-imports.cjs:56–58`
**Severidade:** Alto | **Esforço:** Médio

**Problema:**

```js
const userHooks = Object.keys(HOOK_MAP).filter(h => content.includes(`${h}(`));
if (userHooks.length > 0) continue;
```

Se um arquivo já importou `useAuthUser` mas ainda usa o padrão antigo `useAuth()` para outras propriedades (ex: `loading`), o script pula o arquivo silenciosamente. O resultado é que `useAuth()` permanece no arquivo mas o código que precisaria de `useAuthLoading` não é migrado.

**Correção:**

Registrar os arquivos pulados com a razão, para revisão manual:

```js
if (userHooks.length > 0) {
  console.log(`  ⚠ SKIP (parcialmente migrado): ${path.relative(ROOT, file)}`);
  skippedCount++;
  continue;
}
```

---

### 10 | Pattern de import hardcoded no script de migração

**Arquivo:** `optimize-auth-imports.cjs:61`
**Severidade:** Alto | **Esforço:** Baixo

**Problema:**

```js
const importPattern = /import\s+\{[^}]*\buseAuth\b[^}]*\}\s+from\s+['"]@\/context\/AuthContext['"];?\s*\n?/;
```

O pattern exige `@/context/AuthContext` exato. Arquivos que importam de `../../context/AuthContext` ou `@/context/index` não serão migrados. O script não reporta quantos arquivos foram encontrados versus processados versus pulados por esse motivo.

**Correção:**

Tornar o path de import flexível ou ao menos reportar os arquivos que contêm `useAuth(` mas não foram modificados:

```js
const importPattern = /import\s+\{[^}]*\buseAuth\b[^}]*\}\s+from\s+['"][^'"]*AuthContext['"];?\s*\n?/;
```

---

### 11 | Token em URL path — exposição em logs

**Arquivo:** `reset-password/[token]/page.tsx:305`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

O token de reset de senha está no path da URL: `/reset-password/<token>`. Isso significa que o token aparece em:
- Logs de acesso do servidor (Nginx, Coolify, Vercel)
- Headers `Referer` se houver links externos na página
- Histórico do browser do usuário

A convenção mais segura é passar o token como query string (`?token=...`) — também aparece em logs, mas pode ser omitido por configuração de log mais facilmente — ou como fragment hash (`#token=...`) que não é enviado ao servidor.

**Correção (query string):**

Isso requer mudança coordenada no backend (como o link de email é gerado). Documentar como issue técnica e adicionar comentário no código explicando a escolha arquitetural.

---

### 12 | Flag `locked` em rate-limiter — ilusão de thread-safety

**Arquivo:** `rate-limiter.ts:39–53`
**Severidade:** Médio | **Esforço:** Médio

**Problema:**

```ts
bucket.locked = true;
bucket.count += 1;
// ... calculos ...
bucket.locked = false;
```

JavaScript é single-threaded no event loop, portanto não existe race condition clássica entre callbacks síncronos. Entretanto, o `locked` flag cria uma regressão funcional real: se `checkRateLimit` for chamado enquanto `locked = true` (ex: por um timer ou código assíncrono que eventualmente volte ao event loop durante a seção "travada"), a requisição é recusada mesmo sendo a primeira da janela, retornando `remaining = maxRequests - 0` incorretamente.

Na prática, como o código entre `locked = true` e `locked = false` é síncrono e não faz `await`, o flag nunca fica `true` quando outra chamada chega. O problema é conceitual: o mecanismo parece fazer algo que não faz.

**Correção:**

Remover o flag `locked` completamente — ele é desnecessário e confuso:

```ts
export function checkRateLimit(key: string, maxRequests: number, windowMs = WINDOW_MS) {
  cleanup();
  const now = Date.now();
  let bucket = store.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { count: 1, windowStart: now };
    store.set(key, bucket);
  } else {
    bucket.count += 1;
  }

  const remaining = Math.max(0, maxRequests - bucket.count);
  return {
    allowed: bucket.count <= maxRequests,
    remaining,
    resetAt: bucket.windowStart + windowMs,
  };
}
```

---

### 13 | Map do rate-limiter cresce indefinidamente sem request

**Arquivo:** `rate-limiter.ts:13–22`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

`cleanup()` só roda quando `checkRateLimit` é chamado. Em uma rota de API que recebe burst tráfego por 10 minutos e depois fica ociosa por horas, o Map mantém todas as entradas em memória até que a próxima requisição chegue. Em instâncias com muitas IPs distintas, isso pode acumular MBs de estado.

**Correção:**

Adicionar cleanup por `setInterval` opcional no módulo (apenas em contexto de servidor):

```ts
// No topo do módulo, após as declarações
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, CLEANUP_INTERVAL_MS * 5).unref?.();
}
```

O `.unref()` impede que o timer mantenha o processo vivo.

---

### 14 | `rateLimitHeaders` consome uma requisição ao verificar

**Arquivo:** `rate-limiter.ts:62–73`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

```ts
export function rateLimitHeaders(key, maxRequests, windowMs?) {
  const result = checkRateLimit(key, maxRequests, windowMs); // incrementa o contador!
  return { ... }
}
```

`rateLimitHeaders` chama `checkRateLimit` que incrementa `bucket.count`. Se o caller usar `rateLimitHeaders` para adicionar headers de resposta e já tiver chamado `checkRateLimit` antes, o contador é incrementado duas vezes pela mesma requisição.

**Correção:**

Separar a lógica de "peek" (apenas leitura) da lógica de "consume":

```ts
export function peekRateLimit(key: string, maxRequests: number, windowMs = WINDOW_MS) {
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
  }
  return {
    allowed: bucket.count <= maxRequests,
    remaining: Math.max(0, maxRequests - bucket.count),
    resetAt: bucket.windowStart + windowMs,
  };
}

export function rateLimitHeaders(key: string, maxRequests: number, windowMs?: number) {
  const result = peekRateLimit(key, maxRequests, windowMs);
  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
```

---

### 15 | `IPV6_PRIVATE_RANGES` é dead code

**Arquivo:** `ssrf.ts:13–18`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

```ts
const IPV6_PRIVATE_RANGES = ['fc00::/7', 'fe80::/10', '::1/128', '::/128'];
```

Esta constante é declarada mas nunca utilizada. A função `isPrivateIPv6` não parseia notação CIDR — implementa comparação de strings diretamente. O array cria a impressão de que os ranges são validados via parseador CIDR, o que não é verdade.

**Correção:**

Remover a constante e substituir por comentário documentando os ranges cobertos pela comparação de strings:

```ts
// Ranges privados IPv6 cobertos: ULA fc00::/7, link-local fe80::/10, loopback ::1, unspecified ::
function isPrivateIPv6(hostname: string): boolean { ... }
```

---

### 16 | Evicção de TokenValidator por posição (FIFO de Map), não por expiração

**Arquivo:** `ssrf.ts:169–171`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

```ts
if (this.validTokens.size >= this.MAX_TOKENS) {
  const oldestKey = this.validTokens.keys().next().value; // FIFO por ordem de inserção
  if (oldestKey) this.validTokens.delete(oldestKey);
}
```

O token eviccionado pode ser o mais antigo por inserção, mas não necessariamente o mais próximo de expirar. Tokens de curta duração inseridos antes de tokens de longa duração são removidos primeiro, causando falsos negativos de validação.

**Correção:**

Rodar `cleanup()` antes da verificação de tamanho (já é feito) e, se ainda estiver cheio após cleanup, evitar inserir em vez de remover aleatoriamente:

```ts
static registerToken(prefix: string, expiryMs: number): string {
  this.cleanup(); // remove expirados

  if (this.validTokens.size >= this.MAX_TOKENS) {
    // cleanup já rodou; se ainda cheio, o sistema está sob pressão
    throw new Error('TokenValidator: capacidade máxima atingida');
  }
  // ...
}
```

Alternativamente, encontrar e remover o token com menor `expiry`:

```ts
if (this.validTokens.size >= this.MAX_TOKENS) {
  let minExpiry = Infinity;
  let minKey: string | undefined;
  for (const [k, exp] of this.validTokens) {
    if (exp < minExpiry) { minExpiry = exp; minKey = k; }
  }
  if (minKey) this.validTokens.delete(minKey);
}
```

---

### 17 | Inputs de senha sem atributo `autocomplete`

**Arquivo:** `reset-password/[token]/page.tsx:204–212`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

Os inputs de senha não têm o atributo `autocomplete`. Gerenciadores de senha (1Password, Bitwarden, browsers nativos) precisam de `autocomplete="new-password"` para sugerir e salvar a nova senha corretamente.

**Correção:**

```tsx
<input
  id="newPassword"
  type={showPassword ? 'text' : 'password'}
  autocomplete="new-password"   // adicionar
  // ...
/>

<input
  id="confirmPassword"
  type={showConfirm ? 'text' : 'password'}
  autocomplete="new-password"   // adicionar
  // ...
/>
```

---

### 18 | Campos de senha sem `aria-describedby` nas mensagens de erro

**Arquivo:** `reset-password/[token]/page.tsx:200–269`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

A mensagem de erro de validação (`{error && <div role="alert">...</div>}`) é exibida visualmente abaixo dos campos, mas os inputs não têm `aria-describedby` apontando para ela. Leitores de tela (NVDA, VoiceOver) não associam o erro ao campo que o causou — anunciam apenas quando o foco está no container `role="alert"`, não quando o usuário navega pelos inputs.

**Correção:**

```tsx
const errorId = 'reset-password-error';

<input
  id="newPassword"
  aria-describedby={error ? errorId : undefined}
  // ...
/>

{error && (
  <div id={errorId} className={styles.errorBanner} role="alert" aria-live="assertive">
    <AlertCircle size={16} aria-hidden="true" />
    <span>{error}</span>
  </div>
)}
```

---

### 19 | `maskCpf` expõe 2 dígitos finais — LGPD minimização incompleta

**Arquivo:** `cpf.ts:13–17`
**Severidade:** Médio | **Esforço:** Baixo

**Problema:**

```ts
return `***.***.***-${digits.slice(9)}`;
// Resultado: ***.***.***-00
```

A função retorna os 2 últimos dígitos do CPF em texto claro. O dígito verificador do CPF é matematicamente derivado dos 9 primeiros dígitos — expor os 2 últimos ajuda na identificação. Para minimização de dados conforme LGPD Art. 6°, III, o mask deveria ser total em listagens:

**Correção:**

```ts
export function maskCpf(value?: string | null): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return '-';
  return '***.***.***-**';
}
```

Se a identificação mínima for requisito de produto, documentar explicitamente e adicionar revisão de conformidade LGPD.

---

### 20 | `WINDOW_MS === CLEANUP_INTERVAL_MS` — coincidência frágil

**Arquivo:** `rate-limiter.ts:1–2`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

```ts
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;
```

Ambos os valores são iguais por coincidência. Se `WINDOW_MS` for aumentado para 5 minutos, o `CLEANUP_INTERVAL_MS` não será atualizado automaticamente e o cleanup ficará muito agressivo (removendo buckets que ainda deveriam existir) ou vice-versa. Não há comentário explicando a relação entre os dois.

**Correção:**

```ts
const WINDOW_MS = 60_000; // janela padrão de rate limiting
const CLEANUP_INTERVAL_MS = WINDOW_MS * 2; // limpar a cada 2 janelas
```

---

### 21 | `indent` extraído de forma frágil no script de migração

**Arquivo:** `optimize-auth-imports.cjs:81`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

```js
const indent = destructureMatch[0].match(/^(\s*)/)[1];
```

`destructureMatch[0]` é o resultado do match com `content.match()`, que retorna o texto sem o contexto de linha. O regex `^(\s*)` sempre captura string vazia porque a string matched começa com `const`, não com espaços. O indent extraído será sempre `''`.

**Correção:**

```js
// Buscar o índice do match no conteúdo original e extrair o indent da linha
const matchIndex = content.indexOf(destructureMatch[0]);
const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
const indent = content.slice(lineStart, matchIndex).match(/^(\s*)/)[1];
```

---

### 22 | Script de migração sobrescreve arquivo sem backup

**Arquivo:** `optimize-auth-imports.cjs:96`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

```js
fs.writeFileSync(file, content, 'utf-8');
```

Se o script produzir output incorreto (ex: achado #9 ou #21), o arquivo original é perdido sem possibilidade de recuperação além do git. Em migração automatizada, é boa prática ou fazer o script operar em modo dry-run por padrão, ou escrever em arquivo `.bak` antes.

**Correção:**

Adicionar flag `--apply` para confirmar escrita, com dry-run como default:

```js
const APPLY = process.argv.includes('--apply');

// ...
if (APPLY) {
  fs.writeFileSync(file, content, 'utf-8');
  console.log(`  ✓ ${path.relative(ROOT, file)}`);
} else {
  console.log(`  [dry-run] ${path.relative(ROOT, file)}`);
}
```

---

### 23 | Testes verificam classes internas de tokens de design — frágeis a renomeações

**Arquivo:** `badge.test.tsx:12,17,22,27`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

```ts
expect(screen.getByText('Neutro')).toHaveClass('border-[color:var(--component-badge-neutral-border)]');
```

Testar classes CSS de variáveis de design token acopla os testes a nomes internos do design system. Uma renomeação de token (`--component-badge-neutral-border` → `--badge-neutral-border`) quebraria todos os testes sem que o componente tenha mudado funcionalmente.

**Correção:**

Testar comportamento observável pelo usuário — não o mecanismo de estilo:

```ts
it('renderiza com variante neutral por padrao', () => {
  const { container } = render(<Badge>Neutro</Badge>);
  // Verificar data-attribute ou snapshot de classes composto, não o token interno
  expect(container.firstChild).toMatchSnapshot();
});

// Ou usar data-testid com variante
it('renderiza variante neutral', () => {
  render(<Badge data-testid="badge">Neutro</Badge>);
  expect(screen.getByTestId('badge')).toBeInTheDocument();
  // Se precisar verificar variante, testar via prop, não via classe
});
```

---

### 24 | Botão de submit sem `aria-describedby` ligado ao indicador de força

**Arquivo:** `reset-password/[token]/page.tsx:278–300`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

O botão "Redefinir senha" não está desabilitado quando a senha está fraca, mas também não há feedback para tecnologia assistiva indicando o estado atual da força. O `aria-hidden="true"` na barra de força (`passwordStrength`) oculta a informação de leitores de tela completamente.

**Correção:**

Adicionar um `<p>` visualmente oculto que anuncia a força para leitores de tela:

```tsx
{strength && (
  <>
    <div className={styles.passwordStrength} aria-hidden="true">
      {/* ... barras visuais ... */}
    </div>
    <p className="sr-only" aria-live="polite">
      Força da senha: {strengthLabel[strength]}
    </p>
    <p className={styles.hint}>
      Força: {strengthLabel[strength]} — mínimo 8 caracteres com letras e números.
    </p>
  </>
)}
```

---

### 25 | `isAllowedProxyPath` não normaliza trailing slash nem case

**Arquivo:** `ssrf.ts:90–93`
**Severidade:** Baixo | **Esforço:** Baixo

**Problema:**

```ts
export function isAllowedProxyPath(path: string): boolean {
  return ALLOWED_PROXY_PATHS.some((prefix) => path.startsWith(prefix));
}
```

Um path como `/API/users` ou `/api//users` passa na validação com alguns prefixos mas não com outros, dependendo do case. Não há normalização de case ou de slashes duplicados.

**Correção:**

```ts
export function isAllowedProxyPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  // Normalizar: lowercase, remover slashes duplicados
  const normalized = path.toLowerCase().replace(/\/+/g, '/');
  return ALLOWED_PROXY_PATHS.some((prefix) => normalized.startsWith(prefix.toLowerCase()));
}
```

---

## Prioridade de Correção

### Imediato (bloqueador de CI)
- Achados 1, 2, 3 — os testes não compilam. Todos os pipelines que rodam testes desses três componentes falham.

### Curto prazo (antes do próximo deploy)
- Achado 4 — token gerado com `Math.random()` em código de segurança
- Achado 8 — código duplicado com risco de divergência
- Achado 17 — acessibilidade de gerenciador de senhas (impacto direto no fluxo de recuperação de conta)

### Médio prazo
- Achados 5, 15 — dead code em módulo de segurança gera confusão de manutenção
- Achados 9, 10, 21, 22 — script de migração tem bugs silenciosos
- Achados 12, 13, 14 — rate-limiter com comportamento incorreto em edge cases
- Achado 19 — revisar decisão LGPD de expor dígitos finais do CPF

### Backlog
- Achado 6 — DNS rebinding (mitigação arquitetural, requer mudança na infraestrutura)
- Achados 11, 16, 18, 23, 24, 25 — polish de acessibilidade, robustez e manutenibilidade
