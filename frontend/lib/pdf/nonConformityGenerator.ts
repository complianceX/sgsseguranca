import type { NonConformity } from "@/services/nonConformitiesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawNcBlueprint,
  drawPageBackground,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };
type PdfOutputDoc = { output: (type: "datauri" | "dataurl") => string };

export async function generateNonConformityPdf(
  nc: NonConformity,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "operational");
  drawPageBackground(ctx);

  const code = buildDocumentCode("NC", nc.id || nc.codigo_nc);
  await drawNcBlueprint(ctx, autoTable, nc, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("NC", sanitize(nc.codigo_nc || code), nc.data_identificacao);
  if (options?.save === false && options?.output === "base64") {
    return { base64: pdfDocToBase64(doc as PdfOutputDoc), filename };
  }
  doc.save(filename);
}

