import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

export type MetadataField = {
  label: string;
  value?: string | number | null;
};

type MetadataGridOptions = {
  title: string;
  fields: MetadataField[];
  columns?: 2 | 3;
};

export function drawMetadataGrid(ctx: PdfContext, options: MetadataGridOptions) {
  const { doc, margin, contentWidth, theme } = ctx;
  const columns = options.columns || 2;
  const colWidth = contentWidth / columns;
  const rowMetrics = options.fields.map((field) => {
    const safeValue = sanitize(field.value);
    const labelLines = doc.splitTextToSize(field.label.toUpperCase(), colWidth - 10);
    const valueLines = doc.splitTextToSize(safeValue, colWidth - 10);
    const rowHeight = 4 + labelLines.length * 3 + valueLines.length * 4.3 + 3;
    return { labelLines, valueLines, rowHeight };
  });

  let totalHeight = 10;
  for (let i = 0; i < rowMetrics.length; i += columns) {
    const currentHeights = rowMetrics.slice(i, i + columns).map((x) => x.rowHeight);
    totalHeight += Math.max(...currentHeights, 12);
  }
  totalHeight += 2;

  ensureSpace(ctx, totalHeight + 5);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, totalHeight, theme.spacing.radius, theme.spacing.radius, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(options.title, margin + 4, ctx.y + 6.5);

  let cursorY = ctx.y + 9;
  for (let i = 0; i < options.fields.length; i += columns) {
    const rowFields = options.fields.slice(i, i + columns);
    const rowData = rowMetrics.slice(i, i + columns);
    const rowHeight = Math.max(...rowData.map((x) => x.rowHeight), 12);

    rowFields.forEach((_, colIndex) => {
      const x = margin + colIndex * colWidth;
      const data = rowData[colIndex];
      if (!data) return;
      const baseX = x + 4;
      const baseY = cursorY + 4;

      if (colIndex > 0) {
        doc.setDrawColor(...theme.tone.border);
        doc.setLineWidth(0.2);
        doc.line(x, cursorY, x, cursorY + rowHeight);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.caption);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text(data.labelLines, baseX, baseY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(theme.typography.body);
      doc.setTextColor(...theme.tone.textPrimary);
      const valueStart = baseY + data.labelLines.length * 3.2 + 1.3;
      doc.text(data.valueLines, baseX, valueStart);
    });

    cursorY += rowHeight;
    if (i + columns < options.fields.length) {
      doc.setDrawColor(...theme.tone.border);
      doc.setLineWidth(0.2);
      doc.line(margin, cursorY, margin + contentWidth, cursorY);
    }
  }

  moveY(ctx, totalHeight + theme.spacing.sectionGap);
}

