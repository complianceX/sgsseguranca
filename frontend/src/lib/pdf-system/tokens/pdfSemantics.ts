import type { PdfRgb } from "./visualTokens";
import { pdfColors } from "./pdfColors";

export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type ComplianceLevel = "conforme" | "nao_conforme" | "pendente";
export type AuthorizationLevel = "aprovado" | "bloqueado" | "condicionado";

export const riskSemanticColors: Record<RiskLevel, PdfRgb> = {
  low: pdfColors.success,
  moderate: pdfColors.warning,
  high: [194, 65, 12],
  critical: pdfColors.danger,
};

export const complianceSemanticColors: Record<ComplianceLevel, PdfRgb> = {
  conforme: pdfColors.success,
  nao_conforme: pdfColors.danger,
  pendente: pdfColors.warning,
};

export const authorizationSemanticColors: Record<AuthorizationLevel, PdfRgb> = {
  aprovado: pdfColors.success,
  bloqueado: pdfColors.danger,
  condicionado: pdfColors.warning,
};

