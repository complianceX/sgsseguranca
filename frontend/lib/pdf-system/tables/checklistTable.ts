import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import type { SemanticRulesConfig } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export type ChecklistRow = {
  question?: string;
  answer?: string;
  justification?: string;
};

export function drawChecklistTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  title: string,
  rows: ChecklistRow[],
  options?: { semanticRules?: boolean | SemanticRulesConfig },
) {
  if (!rows.length) return;
  drawSemanticTable(ctx, {
    title,
    tone: "risk",
    autoTable,
    head: [["Pergunta", "Resposta", "Justificativa"]],
    body: rows.map((r) => [
      sanitize(r.question),
      sanitize(r.answer),
      sanitize(r.justification),
    ]),
    semanticRules: options?.semanticRules,
    overrides: {
      styles: { fontSize: 7.6, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 96 }, 1: { cellWidth: 26 } },
    },
  });
}
