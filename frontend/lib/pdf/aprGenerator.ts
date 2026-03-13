import type { Apr } from "@/services/aprsService";
import type { Signature } from "@/services/signaturesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawAprBlueprint,
  drawPageBackground,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

export async function generateAprPdf(
  apr: Apr,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "critical");
  drawPageBackground(ctx);

  const code = buildDocumentCode("APR", apr.id || apr.numero || apr.titulo);
  await drawAprBlueprint(ctx, autoTable, apr, signatures, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("APR", `${sanitize(apr.numero || code)}_v${apr.versao ?? 1}`, apr.data_inicio);
  if (options?.save === false && options?.output === "base64") {
    const output = doc as unknown as { output: (type: "datauri" | "dataurl") => string };
    return { base64: pdfDocToBase64(output), filename };
  }
  doc.save(filename);
}

