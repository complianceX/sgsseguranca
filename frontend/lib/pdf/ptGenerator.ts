import type { Pt } from "@/services/ptsService";
import type { Signature } from "@/services/signaturesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawPageBackground,
  drawPtBlueprint,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

export async function generatePtPdf(
  pt: Pt,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "critical");
  drawPageBackground(ctx);

  const code = buildDocumentCode(
    "PT",
    pt.id || pt.numero || pt.titulo,
    pt.data_hora_inicio,
  );
  await drawPtBlueprint(ctx, autoTable, pt, signatures, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("PT", sanitize(pt.numero || code), pt.data_hora_inicio);
  if (options?.save === false && options?.output === "base64") {
    const output = doc as unknown as { output: (type: "datauri" | "dataurl") => string };
    return { base64: pdfDocToBase64(output), filename };
  }
  doc.save(filename);
}
