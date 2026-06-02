import { criticalTheme } from "./criticalTheme";
import { operationalTheme } from "./operationalTheme";
import { photographicTheme } from "./photographicTheme";
import { complianceTheme } from "./complianceTheme";
import { trainingTheme } from "./trainingTheme";
import type { PdfVariant, PdfVariantName } from "./types";
export { complianceTheme, trainingTheme, criticalTheme, operationalTheme, photographicTheme };

export const PDF_VARIANTS: Record<PdfVariantName, PdfVariant> = {
  critical: criticalTheme,
  operational: operationalTheme,
  photographic: photographicTheme,
  compliance: complianceTheme,
  training: trainingTheme,
};

export type { PdfVariantName, PdfVariant } from "./types";
