import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import type { SemanticRulesConfig } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export type ComplianceRow = {
  item?: string;
  requirement?: string;
  evidence?: string;
  classification?: string;
};

export function drawComplianceTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  title: string,
  rows: ComplianceRow[],
  options?: { semanticRules?: boolean | SemanticRulesConfig },
) {
  if (!rows.length) return;
  drawSemanticTable(ctx, {
    title,
    tone: "default",
    autoTable,
    head: [["Item", "Requisito", "Evidencia", "Classificacao"]],
    body: rows.map((r) => [
      sanitize(r.item),
      sanitize(r.requirement),
      sanitize(r.evidence),
      sanitize(r.classification),
    ]),
    semanticRules: options?.semanticRules,
  });
}
