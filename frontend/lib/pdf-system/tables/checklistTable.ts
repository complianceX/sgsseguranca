import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
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
    overrides: {
      styles: { fontSize: 7.6, cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 96 }, 1: { cellWidth: 26 } },
    },
  });
}

