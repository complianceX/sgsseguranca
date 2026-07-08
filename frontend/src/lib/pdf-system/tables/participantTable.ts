import type { AutoTableFn, PdfContext } from "../core/types";
import { drawSemanticTable } from "../components/SemanticTable";
import { sanitize } from "../core/format";

export function drawParticipantTable(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  title: string,
  participants: Array<{ name?: string | null; role?: string | null; userId?: string | null }>,
  signedUserIds?: Set<string>,
) {
  if (!participants.length) return;

  const showSigned = signedUserIds !== undefined && signedUserIds.size > 0;
  const numberColumnWidth = 12;
  const roleColumnWidth = showSigned ? 40 : 52;
  const signedColumnWidth = showSigned ? 20 : 0;
  const tableWidth = ctx.contentWidth - 4;
  const nameColumnWidth = tableWidth - numberColumnWidth - roleColumnWidth - signedColumnWidth;

  const head: string[][] = showSigned
    ? [["#", "Nome", "Função", "Assinou"]]
    : [["#", "Nome", "Função"]];

  const body = participants.map((p, index) => {
    const row: (string | number)[] = [
      index + 1,
      sanitize(p.name),
      sanitize(p.role),
    ];
    if (showSigned) {
      const signed = p.userId && signedUserIds!.has(p.userId) ? "Sim" : "Não";
      row.push(signed);
    }
    return row;
  });

  const columnStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: numberColumnWidth },
    1: { cellWidth: nameColumnWidth },
    2: { cellWidth: roleColumnWidth },
  };
  if (showSigned) {
    columnStyles[3] = { cellWidth: signedColumnWidth };
  }

  drawSemanticTable(ctx, {
    title,
    tone: "attendance",
    autoTable,
    head,
    body,
    // Apply semantic colouring to the "Assinou" column:
    // "Sim" → success (green), "Não" → danger (red).
    semanticRules: showSigned
      ? { columns: [3], keywordOverrides: { danger: ["nao", "não"] } }
      : undefined,
    overrides: {
      tableWidth,
      columnStyles,
    },
  });
}
