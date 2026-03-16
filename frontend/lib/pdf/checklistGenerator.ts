import type { Checklist } from "@/services/checklistsService";
import type { Signature } from "@/services/signaturesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawChecklistBlueprint,
  drawPageBackground,
  formatDateTime,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

export async function generateChecklistPdf(
  checklist: Checklist,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "operational");
  drawPageBackground(ctx);

  const code = buildDocumentCode(
    "CHK",
    checklist.id || checklist.titulo,
    checklist.data,
  );
  await drawChecklistBlueprint(ctx, autoTable, checklist, signatures, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("CHECKLIST", checklist.titulo, checklist.data);
  if (options?.output === "base64") {
    const output = doc as unknown as { output: (type: "datauri" | "dataurl") => string };
    return { base64: pdfDocToBase64(output), filename };
  }
  doc.save(filename);
}
