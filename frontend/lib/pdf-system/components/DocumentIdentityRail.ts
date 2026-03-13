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
  ensureSpace(ctx, 16);

  const labels = [
    `Tipo: ${sanitize(options.documentType)}`,
    `Criticidade: ${sanitize(options.criticality)}`,
    `Validade: ${sanitize(options.validity)}`,
    `Classe: ${sanitize(options.documentClass)}`,
  ];

  const railBg = theme.tone.surfaceMuted;
  doc.setFillColor(railBg[0], railBg[1], railBg[2]);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, ctx.y, contentWidth, 12, 1.6, 1.6, "FD");

  doc.setFillColor(...theme.tone.brand);
  doc.rect(margin, ctx.y, 2.2, 12, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textSecondary);
  doc.text(labels.join("   |   "), margin + 4, ctx.y + 7.2, { maxWidth: contentWidth - 7 });

  moveY(ctx, 16);
}
