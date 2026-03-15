import type { Audit } from "@/services/auditsService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentHeader,
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawActionPlanTable, drawComplianceTable } from "../tables";

export async function drawAuditBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  audit: Audit,
  code: string,
  validationUrl: string,
) {
  drawDocumentHeader(ctx, {
    title: "RELATORIO DE AUDITORIA",
    subtitle: "Conformidade, achados e parecer tecnico",
    code,
    date: formatDate(audit.data_auditoria),
    status: "Emitido",
    version: "1",
    company: sanitize(
      (audit as Audit & { company?: { razao_social?: string } }).company?.razao_social ||
        audit.company_id,
    ),
    site: sanitize(audit.site?.nome),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "Auditoria",
    criticality: sanitize(audit.tipo_auditoria),
    validity: formatDate(audit.data_auditoria),
    documentClass: "compliance",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo executivo de auditoria",
    summary: "Sintese de escopo, criterio, achados e plano de acao para suporte a decisao gerencial.",
    metrics: [
      { label: "Tipo", value: sanitize(audit.tipo_auditoria), tone: "info" },
      { label: "Auditor", value: sanitize(audit.auditor?.nome), tone: "default" },
      { label: "Nao conformidades", value: audit.resultados_nao_conformidades?.length || 0, tone: (audit.resultados_nao_conformidades?.length || 0) > 0 ? "warning" : "success" },
      { label: "Plano de acao", value: audit.plano_acao?.length || 0, tone: "info" },
      { label: "Site", value: sanitize(audit.site?.nome), tone: "info" },
      { label: "Data", value: formatDate(audit.data_auditoria), tone: "default" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Contexto da auditoria",
    columns: 2,
    fields: [
      { label: "Titulo", value: audit.titulo },
      { label: "Tipo", value: audit.tipo_auditoria },
      { label: "Data", value: formatDate(audit.data_auditoria) },
      { label: "Auditor", value: audit.auditor?.nome },
      { label: "Site/Obra", value: audit.site?.nome },
      { label: "Representantes", value: audit.representantes_empresa },
    ],
  });

  drawNarrativeSection(ctx, { title: "Objetivo", content: audit.objetivo });
  drawNarrativeSection(ctx, { title: "Escopo", content: audit.escopo });
  drawNarrativeSection(ctx, { title: "Metodologia", content: audit.metodologia });

  drawComplianceTable(
    ctx,
    autoTable,
    "Nao conformidades identificadas",
    (audit.resultados_nao_conformidades || []).map((item, index) => ({
      item: `NC ${index + 1}: ${item.descricao}`,
      requirement: item.requisito,
      evidence: item.evidencia,
      classification: item.classificacao,
    })),
    { semanticRules: { profile: "audit", columns: [3] } },
  );

  drawActionPlanTable(
    ctx,
    autoTable,
    (audit.plano_acao || []).map((item) => ({
      action: `${sanitize(item.item)} - ${sanitize(item.acao)}`,
      owner: sanitize(item.responsavel),
      dueDate: sanitize(item.prazo),
      status: sanitize(item.status),
    })),
    { semanticRules: { profile: "audit" } },
  );

  drawNarrativeSection(ctx, { title: "Parecer final", content: audit.conclusao });

  await drawGovernanceClosingBlock(ctx, {
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
