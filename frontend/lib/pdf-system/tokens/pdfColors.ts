import type { PdfRgb } from "./visualTokens";

export type PdfColors = {
  documentInk: PdfRgb;
  documentNavy: PdfRgb;
  industrialBlue: PdfRgb;
  safetyTeal: PdfRgb;
  success: PdfRgb;
  warning: PdfRgb;
  danger: PdfRgb;
  surface: PdfRgb;
  surfaceStrong: PdfRgb;
  border: PdfRgb;
  muted: PdfRgb;
  white: PdfRgb;
};

export const pdfColors: PdfColors = {
  documentInk: [15, 23, 42], // #0F172A
  documentNavy: [16, 32, 51], // #102033
  industrialBlue: [31, 78, 121], // #1F4E79
  safetyTeal: [15, 118, 110], // #0F766E
  success: [22, 101, 52], // #166534
  warning: [180, 83, 9], // #B45309
  danger: [185, 28, 28], // #B91C1C
  surface: [248, 250, 252], // #F8FAFC
  surfaceStrong: [238, 242, 247], // #EEF2F7
  border: [203, 213, 225], // #CBD5E1
  muted: [100, 116, 139], // #64748B
  white: [255, 255, 255],
};

