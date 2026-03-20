import { drawDocumentHeader, type DocumentHeaderOptions } from "../components";
import { decorateCurrentPage } from "./grid";
import type { PdfContext } from "./types";

export function applyInstitutionalDocumentHeader(
  ctx: PdfContext,
  options: DocumentHeaderOptions,
) {
  ctx.decoratePage = () => {
    drawDocumentHeader(ctx, options);
    return ctx.y;
  };

  return decorateCurrentPage(ctx);
}
