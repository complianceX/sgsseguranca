import { criticalTheme } from "./criticalTheme";
import { operationalTheme } from "./operationalTheme";
import { photographicTheme } from "./photographicTheme";
import type { PdfVariant, PdfVariantName } from "./types";
export { complianceTheme } from "./complianceTheme";
export { trainingTheme } from "./trainingTheme";
export { criticalTheme, operationalTheme, photographicTheme };

export const PDF_VARIANTS: Record<PdfVariantName, PdfVariant> = {
  critical: criticalTheme,
  operational: operationalTheme,
  photographic: photographicTheme,
};

export type { PdfVariantName, PdfVariant } from "./types";
