import type { NonConformity } from "@/services/nonConformitiesService";
import { pdfDocToBase64, type PdfOutputDoc } from "./pdfBase64";
import { fetchImageAsDataUrl } from "./pdfFile";
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawNcBlueprint,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = {
  save?: boolean;
  output?: "base64";
  draftWatermark?: boolean;
};

export async function generateNonConformityPdf(
  nc: NonConformity,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "compliance");

  const code = buildDocumentCode("NC", nc.id || nc.codigo_nc);

  // Fetch company logo if available
  const company = (nc as NonConformity & { company?: { logo_url?: string } }).company;
  const logoUrl = company?.logo_url ? await fetchImageAsDataUrl(company.logo_url) : null;

  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: "RELATORIO DE NAO CONFORMIDADE",
    subtitle:
      "Documento oficial de registro, tratativa e encerramento de desvio",
    code,
    date: nc.data_identificacao,
    status: sanitize(nc.status),
    version: "1",
    company: sanitize(
      (nc as NonConformity & { company?: { razao_social?: string } }).company
        ?.razao_social || nc.company_id,
    ),
    site: sanitize(nc.site?.nome || nc.local_setor_area),
    logoUrl,
  });
  await drawNcBlueprint(ctx, autoTable, nc, code, buildValidationUrl(code));

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
    draft: options?.draftWatermark ?? true,
  });

  const filename = buildPdfFilename("NC", sanitize(nc.codigo_nc || code), nc.data_identificacao);
  if (options?.save === false && options?.output === "base64") {
    return { base64: pdfDocToBase64(doc as PdfOutputDoc), filename };
  }
  doc.save(filename);
}
