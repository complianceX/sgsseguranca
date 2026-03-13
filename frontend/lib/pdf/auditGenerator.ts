import type { Audit } from "@/services/auditsService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawAuditBlueprint,
  drawPageBackground,
  formatDateTime,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

export async function generateAuditPdf(
  audit: Audit,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "operational");
  drawPageBackground(ctx);

  const code = buildDocumentCode("AUD", audit.id || audit.titulo);
  await drawAuditBlueprint(ctx, autoTable, audit, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("AUDITORIA", audit.titulo, audit.data_auditoria);
  if (options?.save === false && options?.output === "base64") {
    const output = doc as unknown as { output: (type: "datauri" | "dataurl") => string };
    return { base64: pdfDocToBase64(output), filename };
  }
  doc.save(filename);
}

