import type { Apr } from "@/services/aprsService";
import type { Signature } from "@/services/signaturesService";
import { pdfDocToBase64 } from "./pdfBase64";
import {
  applyFooterGovernance,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  decorateCurrentPage,
  drawAprBlueprint,
  drawDocumentHeader,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type AprPdfEvidence = {
  id: string;
  apr_risk_item_id: string;
  original_name?: string;
  uploaded_at: string;
  captured_at?: string;
  url?: string;
  watermarked_url?: string;
  risk_item_ordem?: number;
};

type PdfOptions = {
  save?: boolean;
  output?: "base64";
  evidences?: AprPdfEvidence[];
};

async function toDataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateAprPdf(
  apr: Apr,
  signatures: Signature[],
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "compliance");

  const code = buildDocumentCode(
    "APR",
    apr.id || apr.numero || apr.titulo,
    apr.data_inicio,
  );
  const renderHeader = () => {
    drawDocumentHeader(ctx, {
      title: "ANALISE PRELIMINAR DE RISCO",
      subtitle: "Documento tecnico de avaliacao preventiva em SST",
      code,
      date: apr.data_inicio,
      status: sanitize(apr.status),
      version: sanitize(apr.versao ?? 1),
      company: sanitize(apr.company?.razao_social || apr.company_id),
      site: sanitize(apr.site?.nome || apr.site_id),
    });
    return ctx.y;
  };

  ctx.decoratePage = renderHeader;
  ctx.y = decorateCurrentPage(ctx);

  await drawAprBlueprint(
    ctx,
    autoTable,
    apr,
    signatures,
    code,
    buildValidationUrl(code),
    options?.evidences,
    async (item) => {
      const source = item.url || item.watermarked_url;
      if (!source) return null;
      const response = await fetch(source);
      if (!response.ok) return null;
      const blob = await response.blob();
      return toDataUrlFromBlob(blob);
    },
  );

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
