import type { Dds } from "@/services/ddsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawAuthoritySignatureBlock,
  drawDocumentHeader,
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawIntegrityValidationBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawParticipantTable } from "../tables";

export async function drawDdsBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  dds: Dds,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const participantCount = dds.participants?.length ?? 0;
  const audited = Boolean(dds.auditado_por_id || dds.auditado_por?.nome || dds.data_auditoria);

  drawDocumentHeader(ctx, {
    title: "RELATORIO DDS",
    subtitle: "Dialogo Diario de Seguranca com rastreabilidade operacional",
    code,
    date: formatDate(dds.data),
    status: sanitize(dds.status),
    version: "1",
    company: sanitize(dds.company?.razao_social || dds.company_id),
    site: sanitize(dds.site?.nome || dds.site_id),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "DDS",
    criticality: audited ? "low" : "moderate",
    validity: formatDate(dds.data),
    documentClass: "operational",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Sintese executiva",
    summary:
      "Registro de alinhamento de seguranca antes da operacao, com foco em tema, facilitacao, participacao e evidencia de governanca.",
    metrics: [
      { label: "Tema", value: sanitize(dds.tema), tone: "info" },
      { label: "Status", value: sanitize(dds.status), tone: audited ? "success" : "warning" },
      { label: "Participantes", value: participantCount, tone: participantCount > 0 ? "success" : "warning" },
      { label: "Facilitador", value: sanitize(dds.facilitador?.nome), tone: "default" },
      { label: "Site", value: sanitize(dds.site?.nome), tone: "default" },
      { label: "Auditoria", value: audited ? "Registrada" : "Nao auditado", tone: audited ? "success" : "default" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Contexto documental",
    columns: 2,
    fields: [
      { label: "Tema", value: dds.tema },
      { label: "Empresa", value: dds.company?.razao_social || dds.company_id },
      { label: "Data", value: formatDate(dds.data) },
      { label: "Site/Obra", value: dds.site?.nome || dds.site_id },
      { label: "Facilitador", value: dds.facilitador?.nome },
      { label: "Participantes", value: participantCount },
      { label: "Status", value: dds.status },
      { label: "Auditor", value: dds.auditado_por?.nome || "-" },
      { label: "Data auditoria", value: formatDate(dds.data_auditoria) },
      { label: "Modelo", value: dds.is_modelo ? "Sim" : "Nao" },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Conteudo do DDS",
    content: dds.conteudo,
  });

  if (dds.notas_auditoria) {
    drawNarrativeSection(ctx, {
      title: "Notas de auditoria",
      content: dds.notas_auditoria,
    });
  }

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${participantCount})`,
    (dds.participants || []).map((participant) => ({ name: participant.nome })),
  );

  drawAuthoritySignatureBlock(ctx, {
    signatures: signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
  });

  await drawIntegrityValidationBlock(ctx, {
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
