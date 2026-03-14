import type { NonConformity } from "@/services/nonConformitiesService";
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
import { drawActionPlanTable, drawComplianceTable } from "../tables";
import type { ActionPlanRow } from "../tables/actionPlanTable";

export async function drawNcBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  nc: NonConformity,
  code: string,
  validationUrl: string,
) {
  drawDocumentHeader(ctx, {
    title: "RELATORIO DE NAO CONFORMIDADE",
    subtitle: "Registro, tratativa e encerramento de desvio",
    code,
    date: formatDate(nc.data_identificacao),
    status: sanitize(nc.status),
    version: "1",
    company: sanitize(
      (nc as NonConformity & { company?: { razao_social?: string } }).company?.razao_social ||
        nc.company_id,
    ),
    site: sanitize(nc.site?.nome || nc.local_setor_area),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "NC",
    criticality: sanitize(nc.risco_nivel),
    validity: sanitize(nc.verificacao_data ? formatDate(nc.verificacao_data) : "Em aberto"),
    documentClass: "compliance",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo executivo da NC",
    summary: "Documento de compliance com foco em desvio identificado, requisito violado, plano corretivo e evidencias de verificacao.",
    metrics: [
      { label: "Codigo", value: sanitize(nc.codigo_nc), tone: "info" },
      { label: "Status", value: sanitize(nc.status), tone: "warning" },
      { label: "Risco", value: sanitize(nc.risco_nivel), tone: "danger" },
      { label: "Responsavel area", value: sanitize(nc.responsavel_area), tone: "default" },
      { label: "Auditor", value: sanitize(nc.auditor_responsavel), tone: "default" },
      { label: "Setor", value: sanitize(nc.local_setor_area), tone: "info" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificacao da nao conformidade",
    columns: 2,
    fields: [
      { label: "Codigo", value: nc.codigo_nc },
      { label: "Tipo", value: nc.tipo },
      { label: "Data identificacao", value: formatDate(nc.data_identificacao) },
      { label: "Local/Setor", value: nc.local_setor_area },
      { label: "Atividade", value: nc.atividade_envolvida },
      { label: "Responsavel area", value: nc.responsavel_area },
      { label: "Auditor", value: nc.auditor_responsavel },
      { label: "Status", value: nc.status },
    ],
  });

  drawNarrativeSection(ctx, { title: "Descricao do desvio", content: nc.descricao });
  drawNarrativeSection(ctx, { title: "Evidencia observada", content: nc.evidencia_observada });
  drawNarrativeSection(ctx, { title: "Risco/Perigo", content: `${sanitize(nc.risco_perigo)} | ${sanitize(nc.risco_associado)}` });

  drawComplianceTable(ctx, autoTable, "Requisito violado e classificacao", [
    {
      item: sanitize(nc.tipo),
      requirement: [sanitize(nc.requisito_nr), sanitize(nc.requisito_item), sanitize(nc.requisito_procedimento)].filter((x) => x !== "-").join(" | "),
      evidence: sanitize(nc.evidencia_observada),
      classification: sanitize((nc.classificacao || []).join(", ") || nc.risco_nivel),
    },
  ], { semanticRules: { profile: "nc", columns: [3] } });

  const actionRows: ActionPlanRow[] = [];
  if (nc.acao_imediata_descricao) {
    actionRows.push({
      action: `Imediata: ${sanitize(nc.acao_imediata_descricao)}`,
      owner: sanitize(nc.acao_imediata_responsavel),
      dueDate: sanitize(nc.acao_imediata_data),
      status: sanitize(nc.acao_imediata_status || "Pendente"),
    });
  }
  if (nc.acao_definitiva_descricao) {
    actionRows.push({
      action: `Definitiva: ${sanitize(nc.acao_definitiva_descricao)}`,
      owner: sanitize(nc.acao_definitiva_responsavel),
      dueDate: sanitize(nc.acao_definitiva_prazo || nc.acao_definitiva_data_prevista),
      status: sanitize(nc.status),
    });
  }
  drawActionPlanTable(ctx, autoTable, actionRows, { semanticRules: { profile: "nc" } });

  drawNarrativeSection(ctx, { title: "Verificacao e resultado", content: nc.verificacao_resultado });
  drawNarrativeSection(ctx, { title: "Observacoes finais", content: nc.observacoes_gerais });

  drawAuthoritySignatureBlock(ctx, {
    signatures: [
      { label: "Responsavel da area", name: sanitize(nc.responsavel_area), role: "Responsavel", image: nc.assinatura_responsavel_area || null },
      { label: "Tecnico/Auditor", name: sanitize(nc.auditor_responsavel), role: "TST/Auditor", image: nc.assinatura_tecnico_auditor || null },
      { label: "Gestao", name: "Gestao", role: "Gestao", image: nc.assinatura_gestao || null },
    ],
  });

  await drawIntegrityValidationBlock(ctx, {
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
