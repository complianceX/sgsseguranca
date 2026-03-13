import type { PdfContext } from "./types";
import { applyDocumentFooter } from "./pagination";

export { applyDocumentFooter as applyPaginationFooter };

export function ensureBlockFits(ctx: PdfContext, requiredHeight: number, top = 22) {
  if (ctx.y + requiredHeight <= ctx.pageHeight - 20) return;
  ctx.doc.addPage();
  ctx.doc.setFillColor(...ctx.theme.tone.pageBg);
  ctx.doc.rect(0, 0, ctx.pageWidth, ctx.pageHeight, "F");
  ctx.y = top;
}
