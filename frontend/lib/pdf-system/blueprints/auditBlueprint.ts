import type { Audit } from "@/services/auditsService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawActionPlanTable, drawComplianceTable } from "../tables";

type AuditNonComplianceLike = {
  descricao?: string;
  requisito?: string;
  evidencia?: string;
  classificacao?: string;
};

type AuditActionPlanLike = {
  item?: string;
  acao?: string;
  responsavel?: string;
  prazo?: string;
  status?: string;
};

type AuditRiskLike = {
  perigo?: string;
  classificacao?: string;
  impactos?: string;
  medidas_controle?: string;
};

function joinBulletedList(values?: Array<string | null | undefined>) {
  const normalized = (values ?? [])
    .map((value) => sanitize(value).trim())
    .filter(Boolean);

  return normalized.length > 0
    ? normalized.map((value, index) => `${index + 1}. ${value}`).join("\n")
    : undefined;
}

function formatRiskEntries(values?: AuditRiskLike[]) {
  const normalized = (values ?? [])
    .map((item, index) => {
      const risk = {
        perigo: sanitize(item.perigo).trim(),
        classificacao: sanitize(item.classificacao).trim(),
        impactos: sanitize(item.impactos).trim(),
        medidas_controle: sanitize(item.medidas_controle).trim(),
      };
      return { index, risk };
    })
    .filter(({ risk }) =>
      Object.values(risk).some((value) => value.trim().length > 0),
    )
    .map(({ index, risk }) =>
      [
        `${index + 1}. Perigo: ${risk.perigo}`,
        `Classificação: ${risk.classificacao}`,
        `Impactos: ${risk.impactos}`,
        `Medidas de controle: ${risk.medidas_controle}`,
      ].join("\n"),
    );

  return normalized.length > 0 ? normalized.join("\n\n") : undefined;
}

export async function drawAuditBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  audit: Audit,
  code: string,
  validationUrl: string,
) {
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

  drawMetadataGrid(ctx, {
    title: "Caracterização operacional",
    columns: 2,
    fields: [
      { label: "CNAE", value: audit.caracterizacao?.cnae },
      { label: "Grau de risco", value: audit.caracterizacao?.grau_risco },
      {
        label: "Número de trabalhadores",
        value: audit.caracterizacao?.num_trabalhadores ?? null,
      },
      { label: "Turnos", value: audit.caracterizacao?.turnos },
      {
        label: "Atividades principais",
        value: audit.caracterizacao?.atividades_principais,
      },
    ],
  });

  drawNarrativeSection(ctx, { title: "Objetivo", content: audit.objetivo });
  drawNarrativeSection(ctx, { title: "Escopo", content: audit.escopo });
  drawNarrativeSection(ctx, { title: "Metodologia", content: audit.metodologia });
  drawNarrativeSection(ctx, {
    title: "Referências consultadas",
    content: joinBulletedList(audit.referencias),
  });
  drawNarrativeSection(ctx, {
    title: "Documentos avaliados",
    content: joinBulletedList(audit.documentos_avaliados),
  });
  drawNarrativeSection(ctx, {
    title: "Conformidades identificadas",
    content: joinBulletedList(audit.resultados_conformidades),
  });

  drawComplianceTable(
    ctx,
    autoTable,
    "Nao conformidades identificadas",
    (audit.resultados_nao_conformidades || []).map(
      (item: AuditNonComplianceLike, index: number) => ({
      item: `NC ${index + 1}: ${item.descricao}`,
      requirement: item.requisito,
      evidence: item.evidencia,
      classification: item.classificacao,
      }),
    ),
    { semanticRules: { profile: "audit", columns: [3] } },
  );

  drawNarrativeSection(ctx, {
    title: "Observações",
    content: joinBulletedList(audit.resultados_observacoes),
  });
  drawNarrativeSection(ctx, {
    title: "Oportunidades de melhoria",
    content: joinBulletedList(audit.resultados_oportunidades),
  });
  drawNarrativeSection(ctx, {
    title: "Avaliação de riscos",
    content: formatRiskEntries(audit.avaliacao_riscos),
  });

  drawActionPlanTable(
    ctx,
    autoTable,
    (audit.plano_acao || []).map((item: AuditActionPlanLike) => ({
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
