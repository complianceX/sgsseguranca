import type { PdfContext, PdfDoc } from "./types";
import { createPdfTheme } from "./theme";
import type { PdfVariantName } from "../variants";

export const PDF_SAFE_TOP = 22;
export const PDF_SAFE_BOTTOM = 24;

export function createPdfContext(doc: PdfDoc, variant: PdfVariantName): PdfContext {
  const pageWidth = 210;
  const pageHeight = 297;
  const theme = createPdfTheme(variant);
  const margin = theme.spacing.pageMargin;
  const pageTop = Math.max(PDF_SAFE_TOP, margin);
  return {
    doc,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin * 2,
    y: pageTop,
    theme,
    pageTop,
  };
}

export function drawPageBackground(ctx: PdfContext) {
  const { doc, pageWidth, pageHeight, theme } = ctx;
  doc.setFillColor(...theme.tone.pageBg);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

export function decorateCurrentPage(ctx: PdfContext): number {
  const previousY = ctx.y;
  drawPageBackground(ctx);

  let nextTop = Math.max(PDF_SAFE_TOP, ctx.margin);
  if (ctx.decoratePage) {
    ctx.y = ctx.margin;
    const decoratedTop = ctx.decoratePage(ctx);
    nextTop = Math.max(
      nextTop,
      typeof decoratedTop === "number" ? decoratedTop : ctx.y,
    );
  }

  ctx.pageTop = nextTop;
  ctx.y = previousY;
  return nextTop;
}

export function getRemainingHeight(
  ctx: PdfContext,
  safeBottom = PDF_SAFE_BOTTOM,
): number {
  return Math.max(0, ctx.pageHeight - safeBottom - ctx.y);
}

export function startNewPage(ctx: PdfContext, top = PDF_SAFE_TOP): number {
  ctx.doc.addPage();
  const decoratedTop = decorateCurrentPage(ctx);
  ctx.y = Math.max(top, decoratedTop, ctx.margin);
  ctx.pageTop = ctx.y;
  return ctx.y;
}

export function ensureSpace(
  ctx: PdfContext,
  heightNeeded: number,
  top = PDF_SAFE_TOP,
): number {
  if (ctx.y + heightNeeded <= ctx.pageHeight - PDF_SAFE_BOTTOM) return ctx.y;
  return startNewPage(ctx, top);
}

export function moveY(ctx: PdfContext, delta: number): number {
  ctx.y += delta;
  return ctx.y;
}
