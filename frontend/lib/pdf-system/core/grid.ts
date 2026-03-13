import type { PdfContext, PdfDoc } from "./types";
import { createPdfTheme } from "./theme";
import type { PdfVariantName } from "../variants";

export function createPdfContext(doc: PdfDoc, variant: PdfVariantName): PdfContext {
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  return {
    doc,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin * 2,
    y: margin,
    theme: createPdfTheme(variant),
  };
}

export function drawPageBackground(ctx: PdfContext) {
  const { doc, pageWidth, pageHeight, theme } = ctx;
  doc.setFillColor(...theme.tone.pageBg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

export function ensureSpace(ctx: PdfContext, heightNeeded: number, top = 22): number {
  if (ctx.y + heightNeeded <= ctx.pageHeight - 20) return ctx.y;
  ctx.doc.addPage();
  drawPageBackground(ctx);
  ctx.y = top;
  return ctx.y;
}

export function moveY(ctx: PdfContext, delta: number): number {
  ctx.y += delta;
  return ctx.y;
}

