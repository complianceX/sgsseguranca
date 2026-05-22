# 🔒 Segurança: dangerouslySetInnerHTML no Layout

## Contexto

O arquivo `frontend/app/layout.tsx` utiliza `dangerouslySetInnerHTML` para injetar scripts inline que inicializam o tema e fazem reset de cache em desenvolvimento.

## Scripts Inline

### 1. THEME_INIT_INLINE_SCRIPT
**Propósito:** Inicializar o tema (dark/light) antes do hydration do React para evitar FOUC (Flash of Unstyled Content).

**Segurança:**
- ✅ Script 100% hardcoded - sem interpolação de variáveis
- ✅ Sem entrada de usuário
- ✅ Sem dados dinâmicos
- ✅ Executado em contexto confiável (layout root)

**Por que `dangerouslySetInnerHTML` é necessário:**
- O script precisa executar antes do React fazer hydration
- Alternativa seria um arquivo `.js` separado, mas inline é mais performático
- O nome `dangerouslySetInnerHTML` é assustador, mas o uso é seguro quando o conteúdo é hardcoded

### 2. DEV_CACHE_RESET_INLINE_SCRIPT
**Propósito:** Resetar service workers e cache em desenvolvimento local.

**Segurança:**
- ✅ Script 100% hardcoded
- ✅ Apenas em desenvolvimento (`process.env.NODE_ENV !== "production"`)
- ✅ Verificação de hostname (localhost apenas)
- ✅ Sem entrada de usuário

## Boas Práticas Seguidas

1. **Conteúdo Hardcoded:** Ambos scripts são literais de string no código fonte
2. **Sem Interpolação:** Nenhuma variável é interpolada nos scripts
3. **Nonce Adicionado:** Os scripts usam `nonce` do CSP quando disponível
4. **Contexto Confiável:** Arquivo de layout root, não exposto a entrada externa

## Quando NÃO usar

```tsx
// ❌ NUNCA faça isso:
const userContent = getUserInput();
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// ❌ Nem isso:
const html = `<div>${userInput}</div>`;
<div dangerouslySetInnerHTML={{ __html: html }} />
```

## Quando é aceitável

```tsx
// ✅ Conteúdo hardcoded em constante
const HARDCODED_SCRIPT = `(() => { console.log('safe'); })()`;
<script dangerouslySetInnerHTML={{ __html: HARDCODED_SCRIPT }} />

// ✅ Template literals sem interpolação
const SCRIPT = `
  (function() {
    // Código fixo, sem ${variaveis}
  })()
`;
```

## Verificação de Segurança

Para verificar se um uso de `dangerouslySetInnerHTML` é seguro:

1. [ ] O conteúdo é uma constante hardcoded?
2. [ ] Não há interpolação de variáveis?
3. [ ] Não há entrada de usuário?
4. [ ] O contexto é confiável?
5. [ ] CSP nonce está sendo usado quando disponível?

Se todas as respostas forem "sim", o uso é seguro.

## Referências

- [React Docs: dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setinnerhtml)
- [CSP Nonce](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/nonce)
- [XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

**Revisado por:** Engenharia de Segurança  
**Data:** 2026-05-21  
**Status:** ✅ Aprovado para uso
