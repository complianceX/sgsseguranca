import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import type { SemanticRulesConfig } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export type RiskRow = {
  activity?: string;
  hazard?: string;
  probability?: string | number;
  severity?: string | number;
  score?: string | number;
  level?: string;
  control?: string;
};

export function drawRiskTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  rows: RiskRow[],
  options?: { semanticRules?: boolean | SemanticRulesConfig },
) {
  if (!rows.length) return;
  const tableWidth = ctx.contentWidth - 4;
  drawSemanticTable(ctx, {
    title: "Matriz de risco e controles",
    tone: "risk",
    autoTable,
    head: [["Atividade", "Perigo/Fator", "P", "S", "Score", "Nivel", "Controle"]],
    body: rows.map((r) => [
      sanitize(r.activity),
      sanitize(r.hazard),
      sanitize(r.probability),
      sanitize(r.severity),
      sanitize(r.score),
      sanitize(r.level),
      sanitize(r.control),
    ]),
    semanticRules: options?.semanticRules,
    overrides: {
      tableWidth,
      styles: { fontSize: 8.1, cellPadding: 2.3 },
      columnStyles: {
        0: { cellWidth: 29 },
        1: { cellWidth: 31 },
        2: { cellWidth: 9 },
        3: { cellWidth: 9 },
        4: { cellWidth: 10 },
        5: { cellWidth: 16 },
        6: { cellWidth: 70 },
      },
    },
  });
}
