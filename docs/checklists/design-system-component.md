# Checklist: Design System Component

## Contrato base
- [ ] usa tokens, nao hex hardcoded
- [ ] possui `variant` e `size` quando aplicavel
- [ ] suporta tema claro e escuro
- [ ] tem estado `disabled`
- [ ] tem estado `loading` quando aplicavel
- [ ] foco visivel e acessivel
- [ ] texto e contraste dentro de WCAG

## Comportamento
- [ ] estados `hover`, `focus`, `active`
- [ ] suporte a teclado
- [ ] sem dependencia de dominio
- [ ] sem dependencia de service HTTP

## Documentacao
- [ ] exemplos de uso
- [ ] props documentadas
- [ ] regras de composicao documentadas

## Estados visuais
- [ ] loading
- [ ] empty quando o componente representa colecao
- [ ] error quando o componente encapsula fetch
- [ ] success quando relevante
