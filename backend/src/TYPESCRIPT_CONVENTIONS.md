# Convenções TypeScript — SGS Backend

## Regras absolutas
- Proibido: `any` explícito
- Proibido: `@ts-ignore` sem comentário explicando o motivo
- Proibido: `as any` para contornar erro de tipo
- Permitido: `unknown` com narrowing (`instanceof`, `typeof`, type guard)
- Permitido: non-null assertion (`!`) com comentário obrigatório explicando por que o valor nunca é `null`/`undefined` naquele contexto

## Mocks em testes
- Sempre usar `Partial<T>` ou `DeepPartial<T>` para mocks de entidades
- Usar `createMock<T>()` do `@golevelup/ts-jest` para mocks de serviços quando o pacote estiver disponível no módulo
- Proibido: `as any` em mocks para silenciar erro de tipo
- Para dependências privadas em testes, preferir `Reflect.set(...)` ou um tipo estrutural explícito em vez de `as any`

## Exceções em catch
- Sempre usar: `const msg = e instanceof Error ? e.message : String(e)`
- Nunca acessar `.message` diretamente sem verificação de tipo
- Em controllers/services, preferir helpers locais de serialização de erro quando o mesmo padrão aparecer mais de uma vez

## Verificação contínua
- Antes de commitar: `npm run type-check`
- Em PR: pipeline deve rodar `tsc --noEmit` e falhar se houver erro
- Para lint de tipos: `npm run lint:types`

## Débito técnico registrado
- `strictPropertyInitialization`: mantido em `false` por causa de DTOs decorados (`class-validator`/`@nestjs/swagger`) e entidades TypeORM sem inicialização em construtor. O projeto já roda com `strict: true`, mas esta exceção ainda precisa de uma fase de saneamento.
- `noUncheckedIndexedAccess`: mantido em `false` porque a auditoria inicial abriu volume alto de ajustes em produção e testes, exigindo guards adicionais para arrays, mapas e resultados opcionais.
- `noUnusedLocals`: mantido em `false`. Baseline em 2026-04-17: 61 ocorrências.
- ESLint: baseline em 2026-04-17 após limpeza desta fase: `0` errors e `154` warnings em `src`, concentrados principalmente em `@typescript-eslint/no-unsafe-argument`, `@typescript-eslint/no-unsafe-member-access` e `@typescript-eslint/no-unsafe-assignment`. Novas regras de tipagem foram ativadas sem reintroduzir `any` explícito.
