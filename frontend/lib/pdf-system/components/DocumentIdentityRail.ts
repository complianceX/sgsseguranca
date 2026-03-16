import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

type DocumentIdentityRailOptions = {
  documentType: string;
  criticality?: string;
  validity?: string;
  documentClass?: string;
};

export function drawDocumentIdentityRail(ctx: PdfContext, options: DocumentIdentityRailOptions) {
  const { doc, margin, contentWidth, theme } = ctx;
  const fields = [
    { label: "Tipo documental", value: options.documentType },
    { label: "Criticidade", value: options.criticality },
    { label: "Validade", value: options.validity },
    { label: "Classe", value: options.documentClass },
  ].filter(
    (field) =>
      field.value !== undefined &&
      field.value !== null &&
      String(field.value).trim() !== "",
  );
  const rowCount = Math.ceil(fields.length / 2);
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) => {
    const fieldsInRow = fields.slice(rowIndex * 2, rowIndex * 2 + 2);
    const rowColumns = fieldsInRow.length === 1 ? 1 : 2;
    const colWidth = contentWidth / rowColumns;
    return Math.max(
      ...fieldsInRow.map((field) => {
        const valueLines = doc.splitTextToSize(
          sanitize(field.value),
          colWidth - 10,
        );
        return 8 + valueLines.length * 3.6;
      }),
      14,
    );
  });
  const totalHeight = rowHeights.reduce((sum, value) => sum + value, 0);
  ensureSpace(ctx, totalHeight + 5);

  const railBg = theme.tone.surfaceMuted;
  doc.setFillColor(railBg[0], railBg[1], railBg[2]);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, ctx.y, contentWidth, totalHeight, 1.8, 1.8, "FD");

  doc.setFillColor(...theme.tone.brand);
  doc.rect(margin, ctx.y, 2.2, totalHeight, "F");

  let cursorY = ctx.y;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowHeight = rowHeights[rowIndex];
    const fieldsInRow = fields.slice(rowIndex * 2, rowIndex * 2 + 2);
    const rowColumns = fieldsInRow.length === 1 ? 1 : 2;
    const colWidth = contentWidth / rowColumns;

    fieldsInRow.forEach((field, columnIndex) => {
      const x = margin + columnIndex * colWidth;
      if (columnIndex > 0) {
        doc.setDrawColor(...theme.tone.border);
        doc.setLineWidth(0.18);
        doc.line(x, cursorY, x, cursorY + rowHeight);
      }

      const baseX = x + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.caption);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text(field.label.toUpperCase(), baseX, cursorY + 4.8);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textSecondary);
      const valueLines = doc.splitTextToSize(
        sanitize(field.value),
        colWidth - 10,
      );
      doc.text(valueLines, baseX, cursorY + 9.2);
    });

    cursorY += rowHeight;
    if (rowIndex < rowCount - 1) {
      doc.setDrawColor(...theme.tone.border);
      doc.setLineWidth(0.18);
      doc.line(margin, cursorY, margin + contentWidth, cursorY);
    }
  }

  moveY(ctx, totalHeight + 5);
}
