import type { PdfTone } from "../tokens/visualTokens";

export type PdfVariantName = "critical" | "operational" | "photographic";

export type PdfVariant = {
  name: PdfVariantName;
  label: string;
  tone: Partial<PdfTone>;
};

