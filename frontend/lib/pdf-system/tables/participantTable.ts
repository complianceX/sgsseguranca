import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export function drawParticipantTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  title: string,
  participants: Array<{ name?: string }>,
) {
  if (!participants.length) return;
  drawSemanticTable(ctx, {
    title,
    tone: "attendance",
    autoTable,
    head: [["#", "Nome"]],
    body: participants.map((p, index) => [index + 1, sanitize(p.name)]),
    overrides: { columnStyles: { 0: { cellWidth: 12 } } },
  });
}

