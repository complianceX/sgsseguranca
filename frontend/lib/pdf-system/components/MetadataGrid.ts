import type { PdfContext } from "../core/types";
import {
  ensureSpace,
  getRemainingHeight,
  moveY,
  PDF_SAFE_BOTTOM,
  PDF_SAFE_TOP,
  startNewPage,
} from "../core/grid";
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

  type RowGroup = {
    rowFields: MetadataField[];
    rowData: Array<(typeof rowMetrics)[number]>;
    rowHeight: number;
  };

  const rowGroups: RowGroup[] = [];
  for (let i = 0; i < options.fields.length; i += columns) {
    const rowFields = options.fields.slice(i, i + columns);
    const rowData = rowMetrics.slice(i, i + columns);
    rowGroups.push({
      rowFields,
      rowData,
      rowHeight: Math.max(...rowData.map((x) => x.rowHeight), 12),
    });
  }

  const renderChunk = (
    chunk: RowGroup[],
    title: string,
  ) => {
    let totalHeight = 12;
    chunk.forEach((row) => {
      totalHeight += row.rowHeight;
    });

    doc.setFillColor(...theme.tone.surface);
    doc.setDrawColor(...theme.tone.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(
      margin,
      ctx.y,
      contentWidth,
      totalHeight,
      theme.spacing.radius,
      theme.spacing.radius,
      "FD",
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.headingSm);
    doc.setTextColor(...theme.tone.textPrimary);
    doc.text(title, margin + 4, ctx.y + 6.5);

    let cursorY = ctx.y + 9;
    chunk.forEach((row, rowIndex) => {
      row.rowFields.forEach((_, colIndex) => {
        const x = margin + colIndex * colWidth;
        const data = row.rowData[colIndex];
        if (!data) return;
        const baseX = x + 4;
        const baseY = cursorY + 4;

        if (colIndex > 0) {
          doc.setDrawColor(...theme.tone.border);
          doc.setLineWidth(0.2);
          doc.line(x, cursorY, x, cursorY + row.rowHeight);
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

      cursorY += row.rowHeight;
      if (rowIndex + 1 < chunk.length) {
        doc.setDrawColor(...theme.tone.border);
        doc.setLineWidth(0.2);
        doc.line(margin, cursorY, margin + contentWidth, cursorY);
      }
    });

    moveY(ctx, totalHeight + theme.spacing.sectionGap);
  };

  let cursor = 0;
  let isContinuation = false;
  while (cursor < rowGroups.length) {
    ensureSpace(ctx, 24);
    let availableHeight = getRemainingHeight(ctx);
    const nextRow = rowGroups[cursor];
    const freshPageAvailableHeight =
      ctx.pageHeight - PDF_SAFE_BOTTOM - Math.max(PDF_SAFE_TOP, ctx.margin);

    if (
      nextRow &&
      12 + nextRow.rowHeight > availableHeight &&
      12 + nextRow.rowHeight <= freshPageAvailableHeight &&
      ctx.y > Math.max(PDF_SAFE_TOP, ctx.margin)
    ) {
      startNewPage(ctx);
      availableHeight = getRemainingHeight(ctx);
    }

    const chunk: RowGroup[] = [];
    let consumedHeight = 12;

    while (cursor < rowGroups.length) {
      const next = rowGroups[cursor];
      if (!next) break;
      if (chunk.length > 0 && consumedHeight + next.rowHeight > availableHeight) {
        break;
      }
      chunk.push(next);
      consumedHeight += next.rowHeight;
      cursor += 1;
    }

    if (chunk.length === 0) {
      chunk.push(rowGroups[cursor]!);
      cursor += 1;
    }

    renderChunk(
      chunk,
      isContinuation ? `${options.title} (continuação)` : options.title,
    );
    isContinuation = true;
  }
}
