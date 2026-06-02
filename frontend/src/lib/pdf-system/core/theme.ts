import { baseTone, spacing, typography } from "../tokens/visualTokens";
import { PDF_VARIANTS, type PdfVariantName } from "../variants";
import type { PdfTheme } from "./types";

export function createPdfTheme(variant: PdfVariantName): PdfTheme {
  const variantTone = PDF_VARIANTS[variant].tone;
  return {
    variant,
    tone: { ...baseTone, ...variantTone },
    typography,
    spacing,
  };
}

