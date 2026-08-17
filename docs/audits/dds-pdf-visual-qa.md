# DDS PDF Visual QA

Data: 2026-08-16. PDFs sintéticos gerados pelo gerador real do frontend; nenhum dado, assinatura ou storage real foi utilizado.

## Resultado

O Golden/stress test gerou e validou PDFs com 5, 30, 100 e 300 participantes. Todos começaram com `%PDF-`, foram abertos pelo PyMuPDF e não apresentaram páginas vazias.

| Participantes | Tamanho | Páginas | Texto extraído | Páginas vazias |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 276 KB | 3 | 3.081 caracteres | 0 |
| 30 | 383 KB | 6 | 7.174 caracteres | 0 |
| 100 | 680 KB | 14 | 18.563 caracteres | 0 |
| 300 | 1.530 KB | 38 | 51.475 caracteres | 0 |

Total inspecionado: 61 páginas renderizadas. A revisão visual confirmou header/footer consistentes, continuidade das tabelas, paginação sem linhas cortadas, início da governança após o último participante e ausência de sobreposição ou páginas em branco.

Artefatos locais: `frontend/output/pdf/dds-stress-5-2026-08-16.pdf`, `dds-golden-2026-08-16.pdf`, `dds-stress-100-2026-08-16.pdf`, `dds-stress-300-2026-08-16.pdf` e renders em `tmp/pdfs/dds-visual-qa`.

Limite da prova: a inspeção foi visual local por renderização de páginas, não um teste browser autenticado do fluxo completo de emissão/download. O hash visível usa truncamento com reticências por design; isso não foi classificado como clipping.
