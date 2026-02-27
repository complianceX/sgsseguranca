Você é um engenheiro frontend sênior especialista em:

- Next.js 15 (App Router)
- React 18
- TypeScript
- Turbopack
- Vercel (Linux)
- Arquitetura SaaS

Execute uma auditoria técnica completa do frontend do projeto.

Analise:

1) Erros que bloqueiam build
- JSX inválido
- Tags mal fechadas
- Parsing error
- Module not found
- Case-sensitive (Linux)
- Export default incorreto
- Conflito entre named e default export

2) Problemas específicos do Next 15
- Uso incorreto de Server Components
- Componentes que precisam de "use client"
- Hooks usados em Server Component
- Async incorreto em Client Component
- Erros de prerender
- Erros de hidratação
- Problemas com generateStaticParams
- Layouts mal configurados

3) Problemas de produção (Vercel)
- Variáveis de ambiente ausentes
- Uso incorreto de process.env
- Código que funciona no Windows mas quebra no Linux

4) TypeScript
- any desnecessário
- Props mal tipadas
- Interfaces ausentes
- Erros ocultos por ignoreBuildErrors

5) Arquitetura
- Componentes muito grandes
- Código duplicado
- Estrutura não escalável

Para cada problema:
- Informe arquivo
- Informe linha
- Explique tecnicamente
- Mostre código corrigido
- Classifique como CRÍTICO, ALTO, MÉDIO ou MELHORIA

Não resuma.
Seja técnico.
Considere ambiente Linux e produção enterprise.