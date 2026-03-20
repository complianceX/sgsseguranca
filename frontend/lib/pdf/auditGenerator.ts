import type { Audit } from "@/services/auditsService";
import { pdfDocToBase64, type PdfOutputDoc } from "./pdfBase64";
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawAuditBlueprint,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

export async function generateAuditPdf(
  audit: Audit,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "compliance");

  const code = buildDocumentCode("AUD", audit.id || audit.titulo);
  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: "RELATORIO DE AUDITORIA",
    subtitle: "Documento oficial de conformidade, achados e parecer tecnico",
    code,
    date: audit.data_auditoria,
    status: "Emitido",
    version: "1",
    company: sanitize(
      (audit as Audit & { company?: { razao_social?: string } }).company
        ?.razao_social || audit.company_id,
    ),
    site: sanitize(audit.site?.nome),
  });
  await drawAuditBlueprint(ctx, autoTable, audit, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename("AUDITORIA", audit.titulo, audit.data_auditoria);
  if (options?.save === false && options?.output === "base64") {
    const output = doc as unknown as PdfOutputDoc;
    return { base64: pdfDocToBase64(output), filename };
  }
  doc.save(filename);
}
