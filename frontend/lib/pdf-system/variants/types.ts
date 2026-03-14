import type { PdfTone } from "../tokens/visualTokens";

export type PdfVariantName = "critical" | "operational" | "photographic" | "compliance" | "training";

export type PdfVariant = {
  name: PdfVariantName;
  label: string;
  tone: Partial<PdfTone>;
};
