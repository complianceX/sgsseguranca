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
  });
}
