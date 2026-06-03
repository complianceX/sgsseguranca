import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import type { SemanticRulesConfig } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export type ActionPlanRow = {
  action?: string;
  owner?: string;
  dueDate?: string;
  status?: string;
};

export function drawActionPlanTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  rows: ActionPlanRow[],
  options?: { semanticRules?: boolean | SemanticRulesConfig },
) {
  if (!rows.length) return;
  const tableWidth = ctx.contentWidth - 4;
  const actionColumnWidth = 88;
  const ownerColumnWidth = 34;
  const dueDateColumnWidth = 19;
  const statusColumnWidth =
    tableWidth -
    actionColumnWidth -
    ownerColumnWidth -
    dueDateColumnWidth;
  drawSemanticTable(ctx, {
    title: "Plano de acao",
    tone: "action",
    autoTable,
    head: [["Acao", "Responsavel", "Prazo", "Status"]],
    body: rows.map((r) => [
      sanitize(r.action),
      sanitize(r.owner),
      sanitize(r.dueDate),
      sanitize(r.status),
    ]),
    semanticRules: options?.semanticRules,
    overrides: {
      tableWidth,
      styles: { fontSize: 7.8, cellPadding: 2.15 },
      columnStyles: {
        0: { cellWidth: actionColumnWidth },
        1: { cellWidth: ownerColumnWidth },
        2: { cellWidth: dueDateColumnWidth },
        3: { cellWidth: statusColumnWidth },
      },
    },
  });
}
