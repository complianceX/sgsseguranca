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
  options?: {
    semanticRules?: boolean | SemanticRulesConfig;
    hideEmptyJustification?: boolean;
  },
) {
  if (!rows.length) return;
  const hasJustification = rows.some((row) =>
    Boolean(sanitize(row.justification).replace(/^-$/, "").trim()),
  );
  const shouldHideJustification =
    options?.hideEmptyJustification !== false && !hasJustification;
  const answerWidth = 24;
  const justificationWidth = 42;
  const questionWidth = shouldHideJustification
    ? Math.max(96, ctx.contentWidth - answerWidth)
    : Math.max(84, ctx.contentWidth - answerWidth - justificationWidth);

  drawSemanticTable(ctx, {
    title,
    tone: "risk",
    autoTable,
    head: [
      shouldHideJustification
        ? ["Pergunta", "Resposta"]
        : ["Pergunta", "Resposta", "Justificativa"],
    ],
    body: rows.map((r) =>
      shouldHideJustification
        ? [sanitize(r.question), sanitize(r.answer)]
        : [
            sanitize(r.question),
            sanitize(r.answer),
            sanitize(r.justification),
          ],
    ),
    semanticRules: options?.semanticRules,
    overrides: {
      tableWidth: ctx.contentWidth,
      styles: { fontSize: 7.4, cellPadding: 2 },
      columnStyles: shouldHideJustification
        ? { 0: { cellWidth: questionWidth }, 1: { cellWidth: answerWidth } }
        : {
            0: { cellWidth: questionWidth },
            1: { cellWidth: answerWidth },
            2: { cellWidth: justificationWidth },
          },
    },
  });
}
