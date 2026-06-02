import type { jsPDF } from "jspdf";
import type { PdfVariantName } from "../variants";
import type { PdfContext } from "./types";
import { createGrid } from "./pdfGrid";

export function createPdfDocument(doc: jsPDF, variant: PdfVariantName): PdfContext {
  return createGrid(doc, variant);
}

