import type { Inspection } from "@/services/inspectionsService";
import api from "@/lib/api";
import { pdfDocToBase64, type PdfOutputDoc } from "./pdfBase64";
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  buildPdfFilename,
  buildValidationUrl,
  createPdfContext,
  drawPhotographicReportBlueprint,
  formatDateTime,
  sanitize,
} from "@/lib/pdf-system";

type PdfOptions = { save?: boolean; output?: "base64" };

async function toDataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadEvidenceDataUrlFromApi(
  inspectionId: string,
  index: number,
): Promise<string | null> {
  try {
    const response = await api.get<ArrayBuffer>(
      `/inspections/${inspectionId}/evidences/${index}/file`,
      { responseType: "arraybuffer" },
    );

    const contentTypeHeader = response.headers?.["content-type"];
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : contentTypeHeader || "application/octet-stream";

    const blob = new Blob([response.data], { type: contentType });
    return toDataUrlFromBlob(blob);
  } catch {
    return null;
  }
}

export async function generateInspectionPdf(
  inspection: Inspection,
  options?: PdfOptions,
): Promise<void | { base64: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "photographic");

  const code = buildDocumentCode(
    "INS",
    inspection.id || inspection.tipo_inspecao,
    inspection.data_inspecao,
  );
  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: "RELATORIO FOTOGRAFICO DE SST",
    subtitle:
      "Documento oficial de evidencias tecnicas e observacoes operacionais",
    code,
    date: inspection.data_inspecao,
    status: "Emitido",
    version: "1",
    company: sanitize(
      (inspection as Inspection & { company?: { razao_social?: string } })
        .company?.razao_social || inspection.company_id,
    ),
    site: sanitize(inspection.site?.nome),
  });
  await drawPhotographicReportBlueprint(
    ctx,
    autoTable,
    inspection,
    code,
    buildValidationUrl(code),
    async (item, index) => {
      const source = item.source;
      if (!source) return null;
      if (source.startsWith("data:")) return source;

      if (inspection.id) {
        const apiDataUrl = await loadEvidenceDataUrlFromApi(inspection.id, index);
        if (apiDataUrl) {
          return apiDataUrl;
        }
      }

      if (!source.startsWith("http://") && !source.startsWith("https://")) {
        return null;
      }

      const remote = await fetch(source);
      if (!remote.ok) return null;
      const blob = await remote.blob();
      return toDataUrlFromBlob(blob);
    },
  );

  applyFooterGovernance(ctx, {
    code,
    generatedAt: formatDateTime(new Date().toISOString()),
  });

  const filename = buildPdfFilename(
    "INSPECAO",
    `${inspection.tipo_inspecao}_${inspection.setor_area}`,
    inspection.data_inspecao,
  );
  if (options?.save === false && options?.output === "base64") {
    return { base64: pdfDocToBase64(doc as PdfOutputDoc), filename };
  }
  doc.save(filename);
}
