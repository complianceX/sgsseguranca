# ADR-001: Frontend Modular Architecture

## Status
Aceito

## Contexto
O frontend atual usa Next.js com boa base tecnica, mas ainda depende fortemente de paginas que acumulam:
- carregamento de dados
- estado local
- composicao visual
- tratamento de erro
- acoplamento com services

Esse formato reduz reuso, dificulta testes e gera telas muito grandes.

## Decisao
Adotar arquitetura de frontend orientada a dominio.

### Estrutura
```txt
frontend/
  app/
  components/
    ui/
    shared/
  modules/
    <domain>/
      api/
      components/
      hooks/
      model/
      schemas/
      screens/
      mappers/
  hooks/
  lib/
  providers/
  styles/
  types/
```

## Regras
- `app/` nao concentra regra de negocio.
- `modules/<domain>/screens` compoe a tela final do dominio.
- `modules/<domain>/api` adapta chamadas HTTP do dominio.
- `modules/<domain>/hooks` encapsula carregamento, mutacao e comportamento de tela.
- `components/ui` nao conhece dominio.
- `components/shared` conhece experiencia, mas nao conhece regra de negocio.
- `lib` e apenas infraestrutura.

## Consequencias
- Ganho de consistencia entre telas.
- Melhor isolamento para testes.
- Menor dependencia de paginas monoliticas.
- Migracao gradual possivel sem quebrar rotas existentes.
