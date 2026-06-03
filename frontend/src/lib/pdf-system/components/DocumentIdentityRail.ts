import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

type DocumentIdentityRailOptions = {
  documentType: string;
  criticality?: string;
  validity?: string;
  documentClass?: string;
};

export function drawDocumentIdentityRail(
  ctx: PdfContext,
  options: DocumentIdentityRailOptions,
) {
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

  if (!fields.length) {
    return;
  }

  const columns =
    fields.length >= 4 ? 4 : fields.length === 3 ? 3 : Math.max(1, fields.length);
  const gap = 3;
  const cardWidth = (contentWidth - gap * Math.max(0, columns - 1)) / columns;
  const accentPalette = [
    theme.tone.brand,
    theme.tone.info,
    theme.tone.warning,
    theme.tone.success,
  ];
  const rows = Array.from(
    { length: Math.ceil(fields.length / columns) },
    (_, index) => fields.slice(index * columns, index * columns + columns),
  );
  const rowHeights = rows.map((row) =>
    Math.max(
      ...row.map((field) => {
        const valueLines = doc.splitTextToSize(
          sanitize(field.value),
          cardWidth - 8,
        ) as string[];
        return 11 + Math.min(valueLines.length, 2) * 4.2;
      }),
      19,
    ),
  );
  const totalHeight =
    rowHeights.reduce((sum, value) => sum + value, 0) +
    gap * Math.max(0, rows.length - 1);
  ensureSpace(ctx, totalHeight + 5);

  let cursorY = ctx.y;
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] || 19;

    row.forEach((field, columnIndex) => {
      const accent =
        accentPalette[(rowIndex * columns + columnIndex) % accentPalette.length];
      const x = margin + columnIndex * (cardWidth + gap);
      const valueLines = (doc.splitTextToSize(
        sanitize(field.value),
        cardWidth - 8,
      ) as string[]).slice(0, 2);

      doc.setFillColor(...theme.tone.surface);
      doc.setDrawColor(...theme.tone.border);
      doc.setLineWidth(0.24);
      doc.roundedRect(
        x,
        cursorY,
        cardWidth,
        rowHeight,
        theme.spacing.radius,
        theme.spacing.radius,
        "FD",
      );
      doc.setFillColor(...accent);
      doc.roundedRect(
        x + 1.6,
        cursorY + 1.4,
        cardWidth - 3.2,
        3.2,
        theme.spacing.radius / 2,
        theme.spacing.radius / 2,
        "F",
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.caption);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text(field.label.toUpperCase(), x + 3.4, cursorY + 8.4);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textPrimary);
      doc.text(valueLines, x + 3.4, cursorY + 13.1);
    });

    cursorY += rowHeight + gap;
  });

  moveY(ctx, totalHeight + 5);
}
