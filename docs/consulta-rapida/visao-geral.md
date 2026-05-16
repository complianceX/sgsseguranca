# Visao Geral

## O que e este sistema

Este repositorio contem um sistema SaaS de SST/GST para gestao de seguranca do trabalho, com foco operacional e documental.

Exemplos de modulos presentes:

- APR
- PT
- DDS
- RDO
- CAT
- Checklist
- Nao Conformidade
- Dossie
- Auditoria
- Empresas, usuarios, sites, treinamentos, maquinas e riscos

## Arquitetura resumida

O projeto esta dividido principalmente em 3 partes:

### Frontend

- stack: Next.js 15
- pasta principal: `frontend/`
- responsavel por dashboard, formularios, tabelas, login e experiencia operacional

### Backend

- stack: NestJS 11 + TypeORM
- pasta principal: `backend/`
- responsavel por API, regras de dominio, seguranca, RBAC, tenant scoping, storage e jobs

### Worker / processamento assincrono

- vive no backend, mas sobe como processo separado
- responsavel por filas e fluxos pesados, como importacao documental e tarefas assicronas

## Principios que ja estao fortes no sistema

- tenant/company scoping
- governanca documental
- trilha auditavel e trilha forense append-only em fluxos criticos
- contratos explicitos para PDF final
- read-only/lock em documentos fechados
- backend como autoridade final para regras sensiveis

## Direcao atual do frontend

O frontend vem sendo movido para uma linguagem mais enterprise:

- fundo branco dominante
- sidebar clara
- cards brancos com borda suave
- azul corporativo controlado
- contraste forte entre titulo, texto principal e texto secundario

## Onde buscar mais detalhe

- `README.md` na raiz: resumo geral do projeto
- `backend/README.md`: backend, seguranca, health, observabilidade e deploy
- `docs/architecture/`: decisoes arquiteturais e baseline tecnico
