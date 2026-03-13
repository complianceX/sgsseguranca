import type { Apr } from "@/services/aprsService";
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
  drawRiskSummaryPanel,
} from "../components";
import { drawParticipantTable, drawRiskTable } from "../tables";

export async function drawAprBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  apr: Apr,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const summary = apr.classificacao_resumo;
  const riskTone = (summary?.critico || 0) > 0 ? "critical" : (summary?.substancial || 0) > 0 ? "high" : (summary?.atencao || 0) > 0 ? "moderate" : "low";

  drawDocumentHeader(ctx, {
    title: "ANALISE PRELIMINAR DE RISCO",
    subtitle: "Documento tecnico de avaliacao preventiva em SST",
    code,
    date: formatDate(apr.data_inicio),
    status: sanitize(apr.status),
    version: sanitize(apr.versao ?? 1),
    company: sanitize(apr.company?.razao_social),
    site: sanitize(apr.site?.nome),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "APR",
    criticality: riskTone,
    validity: `${formatDate(apr.data_inicio)} a ${formatDate(apr.data_fim)}`,
    documentClass: "critical",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo executivo",
    summary: "Documento com foco em perigos, risco residual e controles recomendados para execucao segura da atividade.",
    metrics: [
      { label: "Atividade", value: sanitize(apr.titulo), tone: "info" },
      { label: "Status", value: sanitize(apr.status), tone: riskTone === "critical" ? "danger" : riskTone === "high" ? "warning" : "success" },
      { label: "Total riscos", value: summary?.total ?? apr.risk_items?.length ?? 0, tone: "info" },
      { label: "Criticos", value: summary?.critico ?? 0, tone: (summary?.critico || 0) > 0 ? "danger" : "success" },
      { label: "Altos", value: summary?.substancial ?? 0, tone: (summary?.substancial || 0) > 0 ? "warning" : "success" },
      { label: "Atencao", value: summary?.atencao ?? 0, tone: (summary?.atencao || 0) > 0 ? "warning" : "success" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificacao e contexto",
    columns: 2,
    fields: [
      { label: "Numero", value: apr.numero },
      { label: "Versao", value: apr.versao ?? 1 },
      { label: "Empresa", value: apr.company?.razao_social },
      { label: "Site/Obra", value: apr.site?.nome },
      { label: "Elaborador", value: apr.elaborador?.nome },
      { label: "Status", value: apr.status },
      { label: "Data inicio", value: formatDate(apr.data_inicio) },
      { label: "Data fim", value: formatDate(apr.data_fim) },
    ],
  });

  drawRiskSummaryPanel(ctx, {
    severity: summary?.substancial ?? summary?.critico ?? "-",
    probability: summary?.atencao ?? "-",
    riskLevel: riskTone,
    status: apr.status,
    priorityAction: "Aplicar controles de engenharia e administrativos antes da liberacao final.",
  });

  drawNarrativeSection(ctx, {
    title: "Escopo da atividade",
    content: apr.descricao,
  });

  drawRiskTable(
    ctx,
    autoTable,
    (apr.risk_items || []).map((item) => ({
      activity: item.atividade,
      hazard: item.agente_ambiental || item.condicao_perigosa || item.fonte_circunstancia,
      probability: item.probabilidade,
      severity: item.severidade,
      score: item.score_risco,
      level: item.categoria_risco || item.prioridade,
      control: item.medidas_prevencao,
    })),
    { semanticRules: { profile: "apr" } },
  );

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${apr.participants?.length || 0})`,
    (apr.participants || []).map((participant) => ({ name: participant.nome })),
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
    title: "Governanca, autenticidade e rastreabilidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
