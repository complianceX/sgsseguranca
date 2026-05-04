import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export function drawParticipantTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  title: string,
  participants: Array<{ name?: string; role?: string }>,
) {
  if (!participants.length) return;
  const numberColumnWidth = 12;
  const roleColumnWidth = 52;
  const tableWidth = ctx.contentWidth - 4;
  drawSemanticTable(ctx, {
    title,
    tone: "attendance",
    autoTable,
    head: [["#", "Nome", "Função"]],
    body: participants.map((p, index) => [
      index + 1,
      sanitize(p.name),
      sanitize(p.role),
    ]),
    overrides: {
      tableWidth,
      columnStyles: {
        0: { cellWidth: numberColumnWidth },
        1: { cellWidth: tableWidth - numberColumnWidth - roleColumnWidth },
        2: { cellWidth: roleColumnWidth },
      },
    },
  });
}
