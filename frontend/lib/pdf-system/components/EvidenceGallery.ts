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
  strict?: boolean;
};

async function drawOneEvidence(
  ctx: PdfContext,
  item: EvidenceGalleryItem,
  index: number,
  resolveImageDataUrl?: (item: EvidenceGalleryItem, index: number) => Promise<string | null>,
  strict = false,
) {
  const { doc, margin, contentWidth, theme } = ctx;
  let dataUrl: string | null = null;
  let imageState: "loaded" | "missing" | "error" = "missing";

  if (resolveImageDataUrl) {
    try {
      dataUrl = await resolveImageDataUrl(item, index);
      imageState = dataUrl ? "loaded" : "missing";
    } catch {
      if (strict) {
        throw new Error(
          `Evidência fotográfica ${index + 1} indisponível para emissão oficial.`,
        );
      }
      imageState = "error";
    }
  } else if (item.source?.startsWith("data:")) {
    dataUrl = item.source;
    imageState = "loaded";
  }

  const hasImage = imageState === "loaded" && Boolean(dataUrl);
  const imageWrapW = hasImage ? 74 : 52;
  const imageWrapH = hasImage ? 66 : 36;
  const detailsW = contentWidth - imageWrapW - 16;
  const titleLines = doc.splitTextToSize(
    sanitize(item.title || "Registro fotografico"),
    detailsW,
  );
  const descLines = doc.splitTextToSize(sanitize(item.description), detailsW);
  const metaLines = doc.splitTextToSize(sanitize(item.meta), detailsW);
  const titleHeight = Math.max(4.8, titleLines.length * 4.8);
  const contentTextHeight =
    8 + titleHeight + 6 + descLines.length * 4 + 5 + metaLines.length * 3.4;
  const cardInnerH = Math.max(imageWrapH, contentTextHeight + (hasImage ? 8 : 5));
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
  doc.text(titleLines, textX, ctx.y + 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.bodySm);
  doc.setTextColor(...theme.tone.textSecondary);
  const descriptionY = ctx.y + 18 + titleLines.length * 4.8 + 1.2;
  doc.text(descLines, textX, descriptionY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(theme.typography.caption);
  doc.setTextColor(...theme.tone.textMuted);
  const metaY = descriptionY + descLines.length * 4 + 6;
  doc.text(metaLines, textX, metaY);

  if (hasImage && dataUrl) {
    try {
      const props = doc.getImageProperties(dataUrl as unknown as string);
      const ratio = Math.min(
        (imageWrapW - 4) / props.width,
        (cardInnerH - 4) / props.height,
        1,
      );
      const w = props.width * ratio;
      const h = props.height * ratio;
      const x = margin + 5 + (imageWrapW - w) / 2;
      const y = ctx.y + 6 + (cardInnerH - h) / 2;
      doc.addImage(dataUrl, props.fileType || "PNG", x, y, w, h);
    } catch {
      imageState = "error";
    }
  }

  if (!hasImage || imageState === "error") {
    if (strict && !hasImage) {
      throw new Error(`Evidência fotográfica ${index + 1} indisponível para emissão oficial.`);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(theme.typography.caption);
    doc.setTextColor(...theme.tone.textMuted);
    doc.text(
      imageState === "error" ? "FOTO INDISPONIVEL" : "SEM FOTO",
      margin + 5 + imageWrapW / 2,
      ctx.y + 20,
      { align: "center" },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(theme.typography.bodySm);
    if (imageState === "error") {
      doc.setTextColor(...theme.tone.danger);
    } else {
      doc.setTextColor(...theme.tone.textSecondary);
    }
    doc.text(
      imageState === "error"
        ? "Registro visual nao pode ser carregado."
        : "Evidencia textual preservada no documento.",
      margin + 5 + imageWrapW / 2,
      ctx.y + 25.5,
      { align: "center", maxWidth: imageWrapW - 6 },
    );

    doc.setDrawColor(...theme.tone.border);
    doc.setLineWidth(0.2);
    doc.line(margin + 11, ctx.y + 31, margin + imageWrapW - 1, ctx.y + 31);
  }

  moveY(ctx, cardH + 5);
}

export async function drawEvidenceGallery(ctx: PdfContext, options: EvidenceGalleryOptions) {
  if (!options.items.length) return;
  const { doc, margin, contentWidth, theme } = ctx;
  // Keep the gallery heading together with the first evidence card to avoid orphaned titles.
  ensureSpace(ctx, 60);

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
    await drawOneEvidence(ctx, item, index, options.resolveImageDataUrl, options.strict ?? false);
  }
}
