import type { PdfContext } from "../core/types";
import { ensureSpace, moveY } from "../core/grid";
import { sanitize } from "../core/format";

export type EvidenceGalleryItem = {
  title?: string;
  description?: string;
  meta?: string;
  source?: string;
};

type EvidenceGalleryOptions = {
  title: string;
  items: EvidenceGalleryItem[];
  resolveImageDataUrl?: (item: EvidenceGalleryItem, index: number) => Promise<string | null>;
};

async function drawOneEvidence(
  ctx: PdfContext,
  item: EvidenceGalleryItem,
  index: number,
  resolveImageDataUrl?: (item: EvidenceGalleryItem, index: number) => Promise<string | null>,
) {
  const { doc, margin, contentWidth, theme } = ctx;
  const imageWrapW = 74;
  const imageWrapH = 66;
  const detailsW = contentWidth - imageWrapW - 16;
  const descLines = doc.splitTextToSize(sanitize(item.description), detailsW);
  const metaLines = doc.splitTextToSize(sanitize(item.meta), detailsW);
  const contentTextHeight = 8 + 6 + descLines.length * 4 + 5 + metaLines.length * 3.4;
  const cardInnerH = Math.max(imageWrapH, contentTextHeight + 8);
  const cardH = cardInnerH + 12;
  ensureSpace(ctx, cardH + 6);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.28);
  doc.roundedRect(margin, ctx.y, contentWidth, cardH, 2, 2, "FD");

  doc.setFillColor(...theme.tone.surfaceMuted);
  doc.roundedRect(margin + 5, ctx.y + 6, imageWrapW, cardInnerH, 1.5, 1.5, "F");
  doc.setDrawColor(...theme.tone.borderStrong);
  doc.setLineWidth(0.18);
  doc.roundedRect(margin + 5, ctx.y + 6, imageWrapW, cardInnerH, 1.5, 1.5, "S");

  const textX = margin + imageWrapW + 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  doc.text(`EVIDENCIA ${index + 1}`, textX, ctx.y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(sanitize(item.title || "Registro fotografico"), textX, ctx.y + 18, { maxWidth: detailsW });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textSecondary);
  doc.text(descLines, textX, ctx.y + 24);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  const metaY = ctx.y + 26 + descLines.length * 4 + 4;
  doc.text(metaLines, textX, metaY);

  if (!resolveImageDataUrl) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text("Imagem nao disponivel para renderizacao.", margin + 10, ctx.y + 42);
      moveY(ctx, cardH + 5);
      return;
    }

  try {
    const dataUrl = await resolveImageDataUrl(item, index);
    if (!dataUrl) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(theme.typography.bodySm);
      doc.setTextColor(...theme.tone.textMuted);
      doc.text("Imagem nao encontrada.", margin + 20, ctx.y + 42);
      moveY(ctx, cardH + 5);
      return;
    }
    const props = doc.getImageProperties(dataUrl as unknown as string);
    const ratio = Math.min((imageWrapW - 4) / props.width, (cardInnerH - 4) / props.height, 1);
    const w = props.width * ratio;
    const h = props.height * ratio;
    const x = margin + 5 + (imageWrapW - w) / 2;
    const y = ctx.y + 6 + (cardInnerH - h) / 2;
    doc.addImage(dataUrl, props.fileType || "PNG", x, y, w, h);
  } catch {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(theme.typography.bodySm);
    doc.setTextColor(...theme.tone.danger);
    doc.text("Falha ao carregar imagem.", margin + 18, ctx.y + 42);
  }

  moveY(ctx, cardH + 5);
}

export async function drawEvidenceGallery(ctx: PdfContext, options: EvidenceGalleryOptions) {
  if (!options.items.length) return;
  const { doc, margin, contentWidth, theme } = ctx;
  ensureSpace(ctx, 18);

  doc.setFillColor(...theme.tone.surface);
  doc.setDrawColor(...theme.tone.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ctx.y, contentWidth, 10, 2, 2, "FD");
  doc.setFillColor(...theme.tone.info);
  doc.rect(margin, ctx.y, 2.5, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...theme.tone.textPrimary);
  doc.text(options.title, margin + 5, ctx.y + 6.5);
  moveY(ctx, 12);

  for (const [index, item] of options.items.entries()) {
    await drawOneEvidence(ctx, item, index, options.resolveImageDataUrl);
  }
}
