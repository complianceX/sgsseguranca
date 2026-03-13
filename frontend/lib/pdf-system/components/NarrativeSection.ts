import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

type NarrativeSectionOptions = {
  title: string;
  content?: string | null;
};

export function drawNarrativeSection(ctx: PdfContext, options: NarrativeSectionOptions) {
  if (!options.content) return;
  const { doc, margin, contentWidth, theme } = ctx;

  const lines = doc.splitTextToSize(sanitize(options.content), contentWidth - 8);
  const height = 10 + lines.length * 4.5 + 4;
  ensureSpace(ctx, height + 4);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, height, 2, 2, "FD");
  doc.setFillColor(...theme.tone.info);
  doc.rect(margin, ctx.y, 2.5, 10, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(options.title, margin + 5, ctx.y + 6.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.body);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(lines, margin + 4, ctx.y + 14);

  moveY(ctx, height + theme.spacing.sectionGap);
}

