import type { Inspection } from "@/services/inspectionsService";
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
import { drawActionPlanTable, type ActionPlanRow } from "../tables/actionPlanTable";
import { drawRiskTable, type RiskRow } from "../tables/riskTable";

type InspectionRiskLike = {
  grupo_risco?: string;
  perigo_fator_risco?: string;
  probabilidade?: string | number;
  severidade?: string | number;
  nivel_risco?: string | number;
  classificacao_risco?: string;
  acoes_necessarias?: string;
};

type InspectionActionLike = {
  acao?: string;
  responsavel?: string;
  prazo?: string;
  status?: string;
};

type InspectionEvidenceLike = {
  descricao?: string;
  original_name?: string;
  url?: string;
};

export type ResolveEvidenceImage = (
  item: { source?: string },
  index: number,
) => Promise<string | null>;

export async function drawPhotographicReportBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  inspection: Inspection,
  code: string,
  validationUrl: string,
  resolveEvidenceImage: ResolveEvidenceImage,
) {
  drawDocumentIdentityRail(ctx, {
    documentType: "Relatorio Fotografico",
    criticality: (inspection.perigos_riscos?.length || 0) > 0 ? "moderate" : "low",
    validity: formatDate(inspection.data_inspecao),
    documentClass: "photographic",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Leitura executiva",
    summary: "Documento editorial de campo com narrativa visual orientada a risco, conformidade e rastreabilidade.",
    metrics: [
      { label: "Tipo", value: sanitize(inspection.tipo_inspecao), tone: "info" },
      { label: "Setor/Area", value: sanitize(inspection.setor_area), tone: "info" },
      { label: "Riscos", value: inspection.perigos_riscos?.length || 0, tone: (inspection.perigos_riscos?.length || 0) > 0 ? "warning" : "success" },
      { label: "Acoes", value: inspection.plano_acao?.length || 0, tone: "info" },
      { label: "Evidencias", value: inspection.evidencias?.length || 0, tone: (inspection.evidencias?.length || 0) > 0 ? "success" : "warning" },
      { label: "Responsavel", value: sanitize(inspection.responsavel?.nome), tone: "default" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificacao da vistoria",
    columns: 2,
    fields: [
      { label: "Tipo", value: inspection.tipo_inspecao },
      { label: "Setor/Area", value: inspection.setor_area },
      { label: "Data", value: formatDate(inspection.data_inspecao) },
      { label: "Horario", value: inspection.horario },
      { label: "Responsavel", value: inspection.responsavel?.nome },
      { label: "Site/Obra", value: inspection.site?.nome },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Objetivo da inspecao",
    content: inspection.objetivo,
  });

  drawNarrativeSection(ctx, {
    title: "Contexto de campo",
    content: inspection.descricao_local_atividades,
  });

  const riskRows: RiskRow[] = (inspection.perigos_riscos || []).map(
    (item: InspectionRiskLike) => ({
    activity: item.grupo_risco,
    hazard: item.perigo_fator_risco,
    probability: item.probabilidade,
    severity: item.severidade,
    score: item.nivel_risco,
    level: item.classificacao_risco,
    control: item.acoes_necessarias,
    }),
  );
  drawRiskTable(ctx, autoTable, riskRows);

  const actionRows: ActionPlanRow[] = (inspection.plano_acao || []).map(
    (item: InspectionActionLike) => ({
    action: item.acao,
    owner: item.responsavel,
    dueDate: item.prazo,
    status: item.status,
    }),
  );
  drawActionPlanTable(ctx, autoTable, actionRows);

  await drawEvidenceGallery(ctx, {
    title: "Galeria editorial de evidencias",
    items: (inspection.evidencias || []).map(
      (item: InspectionEvidenceLike, index: number) => ({
      title: `Evidencia ${index + 1}`,
      description: sanitize(item.descricao),
      meta: item.original_name ? `Arquivo: ${item.original_name}` : "Origem: captura em campo",
      source: item.url,
      }),
    ),
    resolveImageDataUrl: resolveEvidenceImage,
  });

  drawNarrativeSection(ctx, {
    title: "Conclusao tecnica",
    content: inspection.conclusao,
  });

  await drawGovernanceClosingBlock(ctx, {
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
