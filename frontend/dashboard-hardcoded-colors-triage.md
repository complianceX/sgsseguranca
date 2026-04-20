# Hardcoded Color Audit (Dashboard)

Comando de levantamento (equivalente ao grep solicitado, usando `rg`):
`rg -n -g "*.ts" -g "*.tsx" "bg-white|bg-gray-|bg-slate-|text-gray-|text-slate-|border-gray-|border-slate-|#[0-9a-fA-F]{3,6}" components/dashboard app/dashboard`

## CORRIGIR (aplicado)
- `app/dashboard/workers/timeline/page.tsx:108`
  - `border-white/10 bg-white/5` -> `border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-overlay)]/55`
- `app/dashboard/sst-agent/page.tsx:733,739,743,747,751,759,782`
  - `bg-white/50`, `bg-white/70` -> `bg-[color:var(--ds-color-surface-overlay)]`
- `app/dashboard/tst/page.tsx:315,324,334,345,389,392,707`
  - `border-white/10`, `bg-white/5`, `bg-white/10`, `text-white` -> tokens DS de borda/surface/texto
- `app/dashboard/settings/page.tsx:595`
  - `bg-white` -> `bg-[var(--ds-color-surface-base)]`
- `app/dashboard/aprs/components/AprForm.tsx:234-235`
  - `bg-slate-300`, `bg-slate-100 text-slate-600` -> tokens DS neutros

## MANTER (justificado)
- `app/dashboard/rdos/page.tsx:1370-1381`
  - CSS inline de impressão (`window.document.write`) para relatório exportável; não é UI temática runtime.
- `app/dashboard/checklists/components/SignatureModal.tsx:278`
  - `penColor="#1e40af"` em canvas de assinatura; token CSS não se aplica diretamente ao traço do canvas.

## Resultado pós-correção
- Varredura geral: restaram apenas os itens da seção **MANTER**.
- Varredura de UI (excluindo itens manter): **0 ocorrências**.
