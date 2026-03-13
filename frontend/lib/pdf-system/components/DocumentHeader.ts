import type { PdfContext } from "../core/types";
import { sanitize } from "../core/format";
import { moveY } from "../core/grid";

export type DocumentHeaderOptions = {
  title: string;
  subtitle: string;
  code: string;
  date?: string;
  version?: string;
  status?: string;
  company?: string;
  site?: string;
};

export function drawDocumentHeader(ctx: PdfContext, options: DocumentHeaderOptions) {
  const { doc, margin, contentWidth, theme } = ctx;
  const codeW = 60;
  const codeX = margin + contentWidth - codeW;
  const textMaxWidth = codeX - margin - 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingLg);
  const titleLines = doc.splitTextToSize(options.title, textMaxWidth);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  const subtitleLines = doc.splitTextToSize(options.subtitle, textMaxWidth);

  const meta = [
    `Empresa: ${sanitize(options.company)}`,
    `Site/Obra: ${sanitize(options.site)}`,
    `Data: ${sanitize(options.date)}`,
  ].join("   |   ");
  const metaLines = doc.splitTextToSize(meta, textMaxWidth);

  const titleHeight = titleLines.length * 5.2;
  const subtitleHeight = subtitleLines.length * 3.8;
  const metaHeight = metaLines.length * 3.6;
  const headerHeight = Math.max(34, 7 + titleHeight + 1.5 + subtitleHeight + 1.2 + metaHeight + 5);

  doc.setFillColor(...theme.tone.brandStrong);
  doc.rect(0, 0, ctx.pageWidth, headerHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingLg);
  doc.setTextColor(...theme.tone.brandOn);
  doc.text(titleLines, margin, 10.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(221, 229, 238);
  const subtitleY = 10.5 + titleHeight + 0.5;
  doc.text(subtitleLines, margin, subtitleY);

  const metaY = subtitleY + subtitleHeight + 0.7;
  doc.text(metaLines, margin, metaY);

  doc.setFillColor(...theme.tone.surface);
  const boxY = 6;
  const boxH = 22;
  doc.roundedRect(codeX, boxY, codeW, boxH, theme.spacing.radius, theme.spacing.radius, "F");
  doc.setDrawColor(...theme.tone.borderStrong);
  doc.setLineWidth(0.35);
  doc.roundedRect(codeX, boxY, codeW, boxH, theme.spacing.radius, theme.spacing.radius, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textSecondary);
  doc.text("IDENTIFICADOR", codeX + codeW / 2, boxY + 5.5, { align: "center" });

  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  const codeLines = doc.splitTextToSize(options.code, codeW - 4);
  doc.text(codeLines, codeX + codeW / 2, boxY + 11.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.caption);
  const statusText = `Status: ${sanitize(options.status)} | V${sanitize(options.version || "1")}`;
  doc.text(statusText, codeX + codeW / 2, boxY + boxH - 3, { align: "center", maxWidth: codeW - 4 });

  moveY(ctx, headerHeight + 7);
}
