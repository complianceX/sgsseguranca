import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
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

export function drawRiskTable(ctx: PdfContext, autoTable: AutoTableFn, rows: RiskRow[]) {
  if (!rows.length) return;
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
    overrides: {
      styles: { fontSize: 7.5, cellPadding: 2.2 },
      columnStyles: { 2: { cellWidth: 9 }, 3: { cellWidth: 9 }, 4: { cellWidth: 11 } },
    },
  });
}

