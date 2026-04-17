import type { Apr } from "@/services/aprsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawEvidenceGallery,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawParticipantTable, drawRiskTable } from "../tables";

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

type AprRiskRowSource = {
  atividade?: string;
  atividade_processo?: string;
  agente_ambiental?: string;
  condicao_perigosa?: string;
  fonte_circunstancia?: string;
  fontes_circunstancias?: string;
  medidas_prevencao?: string;
  probabilidade?: string | number;
  severidade?: string | number;
  score_risco?: string | number;
  categoria_risco?: string;
  prioridade?: string;
};

type AprStructuredRiskRow = {
  atividade?: string;
  agente_ambiental?: string;
  condicao_perigosa?: string;
  fonte_circunstancia?: string;
  probabilidade?: string | number;
  severidade?: string | number;
  score_risco?: string | number;
  categoria_risco?: string;
  prioridade?: string;
  medidas_prevencao?: string;
};

type AprParticipantLike = { nome?: string };

export function resolveAprRiskRows(apr: Apr) {
  const structuredRows = Array.isArray(apr.risk_items) ? apr.risk_items : [];
  if (structuredRows.length > 0) {
    return structuredRows.map((item: AprStructuredRiskRow) => ({
      activity: item.atividade,
      hazard:
        item.agente_ambiental ||
        item.condicao_perigosa ||
        item.fonte_circunstancia,
      probability: item.probabilidade,
      severity: item.severidade,
      score: item.score_risco,
      level: item.categoria_risco || item.prioridade,
      control: item.medidas_prevencao,
    }));
  }

  const matrixRows = Array.isArray(apr.itens_risco)
    ? (apr.itens_risco as AprRiskRowSource[])
    : [];

  return matrixRows.map((item) => ({
    activity: item.atividade || item.atividade_processo,
    hazard:
      item.agente_ambiental ||
      item.condicao_perigosa ||
      item.fonte_circunstancia ||
      item.fontes_circunstancias,
    probability: item.probabilidade,
    severity: item.severidade,
    score:
      item.score_risco ||
      (item.probabilidade && item.severidade
        ? Number(item.probabilidade) * Number(item.severidade)
        : ""),
    level: item.categoria_risco || item.prioridade,
    control: item.medidas_prevencao,
  }));
}

export async function drawAprBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  apr: Apr,
  signatures: Signature[],
  code: string,
  validationUrl: string,
  evidences: AprPdfEvidence[] = [],
  resolveImageDataUrl?: (
    item: AprPdfEvidence,
    index: number,
  ) => Promise<string | null>,
) {
  const summary = apr.classificacao_resumo;
  const riskRows = resolveAprRiskRows(apr);
  const riskTone =
    (summary?.critico || 0) > 0
      ? "critical"
      : (summary?.substancial || 0) > 0
        ? "high"
        : (summary?.atencao || 0) > 0
          ? "moderate"
          : "low";
  const highestRiskLabel =
    (summary?.critico || 0) > 0
      ? "Crítico"
      : (summary?.substancial || 0) > 0
        ? "Substancial"
        : (summary?.atencao || 0) > 0
          ? "De atenção"
          : "Aceitável";

  drawDocumentIdentityRail(ctx, {
    documentType: "APR",
    criticality: highestRiskLabel,
    validity: `${formatDate(apr.data_inicio)} a ${formatDate(apr.data_fim)}`,
    documentClass: "Análise de Risco",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo executivo",
    summary: "Documento com foco em perigos, risco residual e controles recomendados para execução segura da atividade.",
    metrics: [
      { label: "Atividade", value: sanitize(apr.titulo), tone: "info" },
      { label: "Status", value: sanitize(apr.status), tone: riskTone === "critical" ? "danger" : riskTone === "high" ? "warning" : "success" },
      { label: "Total riscos", value: summary?.total ?? riskRows.length, tone: "info" },
      { label: "Maior criticidade", value: highestRiskLabel, tone: riskTone === "critical" ? "danger" : riskTone === "high" ? "warning" : "success" },
      { label: "Criticos", value: summary?.critico ?? 0, tone: (summary?.critico || 0) > 0 ? "danger" : "success" },
      { label: "Substanciais", value: summary?.substancial ?? 0, tone: (summary?.substancial || 0) > 0 ? "warning" : "success" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificação e contexto",
    columns: 2,
    fields: [
      { label: "Número", value: apr.numero },
      { label: "Versão", value: apr.versao ?? 1 },
      { label: "Empresa", value: apr.company?.razao_social },
      { label: "Site/Obra", value: apr.site?.nome },
      { label: "Elaborador", value: apr.elaborador?.nome },
      { label: "Status", value: apr.status },
      { label: "Período", value: `${formatDate(apr.data_inicio)} a ${formatDate(apr.data_fim)}` },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Escopo da atividade",
    content: apr.descricao,
  });

  drawRiskTable(
    ctx,
    autoTable,
    riskRows,
    { semanticRules: { profile: "apr" } },
  );

  drawParticipantTable(
    ctx,
    autoTable,
    `Participantes (${apr.participants?.length || 0})`,
    (apr.participants || []).map((participant: AprParticipantLike) => ({
      name: participant.nome,
    })),
  );

  await drawEvidenceGallery(ctx, {
    title: "Evidências visuais",
    items: evidences.map((item) => ({
      title: item.original_name || `Evidência ${item.risk_item_ordem ?? ""}`.trim(),
      description:
        item.risk_item_ordem !== undefined
          ? `Registro associado ao item de risco #${item.risk_item_ordem + 1}.`
          : "Registro visual anexado à APR.",
      meta: [
        item.captured_at ? `Capturada em: ${formatDate(item.captured_at)}` : undefined,
        item.uploaded_at ? `Upload: ${formatDate(item.uploaded_at)}` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
      source: item.url || item.watermarked_url,
    })),
    resolveImageDataUrl: resolveImageDataUrl
      ? async (_item: unknown, index: number) =>
          resolveImageDataUrl(evidences[index]!, index)
      : undefined,
  });

  await drawGovernanceClosingBlock(ctx, {
    signatures: signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
    code,
    url: validationUrl,
    title: "Governança, autenticidade e rastreabilidade",
    subtitle: "Valide por QR Code ou código no portal público.",
  });
}
