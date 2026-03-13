import type { PdfContext } from "./types";
import { createPdfContext, drawPageBackground, ensureSpace, moveY } from "./grid";
import type { PdfVariantName } from "../variants";

export { drawPageBackground, ensureSpace, moveY };

export function createGrid(doc: PdfContext["doc"], variant: PdfVariantName): PdfContext {
  return createPdfContext(doc, variant);
}

export function getGridColumns(ctx: PdfContext, columns = 12): number[] {
  const colWidth = ctx.contentWidth / columns;
  return Array.from({ length: columns }, (_, i) => ctx.margin + i * colWidth);
}

export function columnWidth(ctx: PdfContext, span: number, columns = 12): number {
  return (ctx.contentWidth / columns) * span;
}

export function columnX(ctx: PdfContext, colStart: number, columns = 12): number {
  return ctx.margin + (ctx.contentWidth / columns) * colStart;
}

