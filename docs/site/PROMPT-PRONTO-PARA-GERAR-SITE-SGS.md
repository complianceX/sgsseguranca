# PROMPT PRONTO — Copie e cole direto em outra IA para gerar o site do SGS

Instruções para a IA que vai gerar o site:

Você é um especialista em produto B2B enterprise, design premium e copy profissional para SaaS de SST/Segurança do Trabalho.

Crie um site institucional completo, moderno, confiável e focado em conversão para o **SGS — Sistema de Gestão de Segurança**.

## Regras ABSOLUTAS (nunca viole)

- Use **exclusivamente** as informações do documento "RELATORIO-COMPLETO-ENTREGAVEIS-SGS-PARA-CRIACAO-SITE.md" (e os relatórios anteriores em docs/site/ se precisar complementar).
- **NUNCA invente** funcionalidades, integrações, clientes, números, certificações, cases ou claims que não existam no relatório.
- Seja preciso com o que o sistema realmente entrega (PDFs governados, Sophie com consentimento, RLS, etc.).
- Linguagem profissional, técnica mas acessível, tom enterprise confiável (evite linguagem "startup hype").
- Destaque fortemente: **governança documental**, **PDF final oficial**, **validação pública**, **trilha forense**, **Sophie assistiva**, **multi-tenant seguro**, **LGPD** e **fluxos completos de SST**.
- Não prometa automação total ou substituição de profissionais de SST.

## Estrutura sugerida do site (use como base e melhore)

1. **Home / Landing**
   - Hero forte com headline + subheadline + CTAs claros ("Solicitar demonstração", "Falar com especialista").
   - Seção de problema (documentos soltos, perda de prazos, falta de rastreabilidade).
   - Seção de solução (plataforma única com governança).
   - Cards dos módulos principais.
   - Bloco forte de "Governança Documental".
   - Bloco Sophie IA.
   - Diferenciais / Prova de confiança.
   - CTA final.

2. **Módulos / Funcionalidades**
   - Agrupamento lógico:
     - Documentos de SST (APR, PT, DDS, RDO, ARR, DID, CAT)
     - Inspeções e Conformidade (Checklists, Auditorias, Não Conformidades, Ações Corretivas, Relatórios Fotográficos)
     - Pessoas e Capacitação (Trabalhadores, Treinamentos, Exames Médicos, EPIs e Fichas)
     - Gestão Operacional (Sites, Riscos, Atividades, Máquinas, Ferramentas, Despesas, Ordens de Serviço)
     - Inteligência e Indicadores (Dashboard, KPIs, Executive, Risk Map, Calendário, Relatórios)
     - Governança (Document Registry, Validação Pública, Pendências, Dossiês, Assinaturas, Bundles)
   - Para cada grupo: o que o usuário consegue fazer + benefícios + destaques de rastreabilidade/PDF/assinatura.

3. **Página dedicada: Governança Documental** (destaque forte)
   - PDF final oficial + hash + storage governado.
   - Validação pública (/validar).
   - Trilha forense e registry.
   - Lock de documentos + nova versão.
   - Vídeos, evidências e bundles.
   - Assinaturas digitais com prova.

4. **Página Sophie — IA Assistiva**
   - O que a Sophie realmente faz (rascunhos, sugestões, análise de imagem, relatórios).
   - Controles fortes: consentimento obrigatório, sanitização de PII, rate limiting, circuit breaker.
   - Mensagem clara: "Assistiva. A responsabilidade técnica continua com a sua equipe."

5. **Segurança e Conformidade (LGPD)**
   - Multi-tenant com RLS no banco.
   - Autenticação forte (CPF + Argon2 + MFA TOTP + CSRF + refresh rotation).
   - RBAC granular + perfis.
   - Consentimentos versionados + privacy requests.
   - Criptografia de dados sensíveis.
   - Trilha completa de auditoria.

6. **Tecnologia** (página secundária, útil para público técnico ou RFP)
   - Stack: Next.js 16 + NestJS 11 + PostgreSQL (Neon) + Redis/BullMQ + Backblaze B2 + Puppeteer.
   - Arquitetura: Workers assíncronos, cache, disaster recovery, observabilidade.
   - Deploy: Vercel (frontend) + Vultr/Coolify (backend + worker).

7. **Outras páginas**
   - Contato / Agendar demonstração
   - Termos, Privacidade, Cookies (linkar para as rotas já existentes no app)
   - (Opcional) Blog / Recursos / NRs

## Elementos visuais e UX recomendados
- Design limpo, profissional, corporativo (tons de azul/verde sóbrios, branco, cards bem espaçados).
- Use o sistema de design do próprio app como referência (badges de status, tabelas, formulários ricos).
- Mostrar fluxos reais de forma visual (diagramas simples de APR → PT → DDS ou screenshots anonimizados).
- Ícones consistentes para cada módulo.
- CTAs sempre visíveis e claros.
- Versão mobile-first.
- Se possível, incluir mockups ou prints reais do dashboard e de documentos (com cuidado para não expor dados sensíveis).

## Claims que você PODE usar (copiados do relatório)

- Plataforma SaaS multi-tenant para gestão de SST.
- Documentos oficiais com PDF final governado, assinaturas digitais, evidências (fotos e vídeos) e validação pública.
- Central de pendências documentais e controle de vencimentos de treinamentos e exames.
- IA Sophie assistiva para rascunhos e análises, sempre com consentimento e proteção de dados.
- Fluxos completos de APR, PT, DDS, checklists, auditorias, não conformidades, ações corretivas, RDOs e relatórios fotográficos.
- Trilha forense, registro documental e isolamento forte entre empresas.
- Conformidade com LGPD desde o design (consentimentos, minimização, criptografia).

## Claims que você NÃO deve usar
- "100% automatizado"
- "Toma decisões automáticas"
- "Substitui o técnico de segurança"
- "Vídeos em todos os documentos"
- Qualquer número de clientes, "X% de redução", uptime ou certificações que não estejam no relatório
- Afirmar que observabilidade ou provedores específicos estão sempre ativos

## Informações técnicas importantes para mencionar com precisão (quando relevante)

- Stack: Next.js 16 (App Router), React 19, NestJS 11, TypeORM, PostgreSQL (Neon), Redis + BullMQ, Backblaze B2, Puppeteer.
- Autenticação: CPF + senha (argon2id), JWT + refresh com CSRF, MFA TOTP.
- Multi-tenant: header x-company-id + Row Level Security no PostgreSQL.
- Documentos: PDF final oficial + hash SHA-256 + registry + signed URLs + public validation.
- IA: OpenAI (gpt-4o) com sanitização PII, consentimento obrigatório e rate limiting.

## Tom e copy

- Profissional, confiável, direto.
- Evite superlativos vazios.
- Foque em **benefícios operacionais e de governança** para o cliente B2B.
- Use frases como "O SGS entrega...", "O sistema permite...", "Com o SGS você consegue...".

## Entregáveis esperados da IA

1. Estrutura completa de páginas (Home, Módulos, Governança, Sophie, Segurança, Tecnologia, Contato).
2. Copy para todas as seções principais.
3. Sugestões de layout e componentes visuais (hero, cards, tabelas, fluxos, depoimentos placeholders).
4. Recomendações de SEO (palavras-chave reais: gestão SST, APR digital, PT online, DDS eletrônico, relatório fotográfico SST, conformidade NR, etc.).
5. Versão responsiva e acessível.
6. (Bônus) Sugestão de estrutura de componentes reutilizáveis se for gerar código.

---

**Anexe ou cole também o conteúdo completo do arquivo:**
`docs/site/RELATORIO-COMPLETO-ENTREGAVEIS-SGS-PARA-CRIACAO-SITE.md`

Comece a geração usando esse relatório como fonte de verdade absoluta.

Boa sorte. O SGS é um produto sólido — o site deve refletir isso com honestidade e profissionalismo.