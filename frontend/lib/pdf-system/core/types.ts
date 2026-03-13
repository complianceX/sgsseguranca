import type { jsPDF } from "jspdf";
import type { PdfTone, PdfTypography, PdfSpacing } from "../tokens/visualTokens";
import type { PdfVariantName } from "../variants";

export type PdfDoc = jsPDF;
export type AutoTableFn = (doc: PdfDoc, options: Record<string, unknown>) => void;

export type PdfTheme = {
  variant: PdfVariantName;
  tone: PdfTone;
  typography: PdfTypography;
  spacing: PdfSpacing;
};

export type PdfContext = {
  doc: PdfDoc;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  contentWidth: number;
  y: number;
  theme: PdfTheme;
};

