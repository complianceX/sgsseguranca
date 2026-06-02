import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  applyFooterGovernance,
  applyInstitutionalDocumentHeader,
  buildDocumentCode,
  createPdfContext,
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawMetadataGrid,
  drawNarrativeSection,
  drawSemanticTable,
} from "@/lib/pdf-system";
import { pdfDocToBase64, type PdfOutputDoc } from "./pdfBase64";
import { fetchImageAsDataUrl } from "./pdfFile";

export interface DailyReportPdfSource {
  companyName?: string | null;
  companyLogoUrl?: string | null;
  siteName?: string | null;
  userName?: string | null;
  generatedAt: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    documents: number;
    health: number;
    actions: number;
    slaBreached: number;
    slaDueToday: number;
  };
  complianceScore: number | null;
  pendingApprovals: {
    aprs: number;
    pts: number;
    checklists: number;
    nonconformities: number;
  };
  riskSummary: {
    alto: number;
    medio: number;
    baixo: number;
  };
  recentActivities: Array<{
    type?: string;
    title?: string;
    description?: string;
    timestamp?: string;
    user?: string;
  }>;
  siteCompliance: Array<{
    siteId?: string;
    siteName?: string;
    score?: number;
    label?: string;
  }>;
}

const MODULE_LABEL: Record<string, string> = {
  apr: "APR",
  pt: "PT",
  dds: "DDS",
  checklist: "Checklist",
  nonconformity: "NC",
  audit: "Auditoria",
  medical_exam: "Exame",
  training: "Treinamento",
  rdo: "RDO",
};

function resolveActivityType(type?: string): string {
  if (!type) return "Registro";
  return MODULE_LABEL[type] ?? type;
}

function resolveStatusSignal(score: number | null) {
  if (score == null) return { label: "Calculando", tone: "info" as const, message: "Dados sendo consolidados." };
  if (score >= 85) return { label: "Excelente", tone: "success" as const, message: "Operação com excelente aderência operacional." };
  if (score >= 70) return { label: "Controlado", tone: "info" as const, message: "Pequenos ajustes elevarão o desempenho." };
  if (score >= 50) return { label: "Atenção", tone: "warning" as const, message: "Priorize regularizações para reduzir exposição." };
  return { label: "Crítico", tone: "danger" as const, message: "Plano de ação imediato recomendado." };
}

export async function generateDailyReportPdf(
  source: DailyReportPdfSource,
  options: { save?: boolean; output?: "base64" } = { save: true },
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx = createPdfContext(doc, "compliance");

  const today = format(new Date(source.generatedAt), "dd/MM/yyyy", { locale: ptBR });
  const dayLabel = format(new Date(source.generatedAt), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const code = buildDocumentCode("RDD", source.companyName ?? "SGS", source.generatedAt.slice(0, 10));
  const statusSignal = resolveStatusSignal(source.complianceScore);
  const company = source.companyName?.trim() || "Empresa não informada";
  const site = source.siteName?.trim() || "Todas as obras";

  const logoUrl = source.companyLogoUrl
    ? await fetchImageAsDataUrl(source.companyLogoUrl)
    : null;

  ctx.y = applyInstitutionalDocumentHeader(ctx, {
    title: "RELATORIO DIARIO DE OPERACAO",
    subtitle: "Consolidado operacional do dia com pendencias, conformidade e atividade registrada.",
    code,
    date: today,
    status: statusSignal.label,
    version: "1",
    company,
    site,
    logoUrl,
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "Relatório Diário",
    criticality: source.summary.critical > 0 ? "critical" : source.summary.high > 0 ? "high" : "controlled",
    validity: today,
    documentClass: "operational",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: `Leitura operacional — ${dayLabel}`,
    summary: statusSignal.message,
    metrics: [
      { label: "Conformidade", value: source.complianceScore ?? "—", tone: statusSignal.tone },
      { label: "Pendências", value: source.summary.total, tone: source.summary.total > 0 ? "warning" : "success" },
      { label: "Críticos", value: source.summary.critical, tone: source.summary.critical > 0 ? "danger" : "success" },
      { label: "Altos", value: source.summary.high, tone: source.summary.high > 0 ? "warning" : "success" },
      { label: "SLA vencidos", value: source.summary.slaBreached, tone: source.summary.slaBreached > 0 ? "danger" : "success" },
      { label: "Obra", value: site, tone: "default" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Contexto do relatório",
    columns: 3,
    fields: [
      { label: "Empresa", value: company },
      { label: "Obra / Setor", value: site },
      { label: "Emissão", value: source.generatedAt ? format(new Date(source.generatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : today },
      { label: "Emitido por", value: source.userName?.trim() || "Sistema" },
      { label: "Documento", value: code },
      { label: "Score do dia", value: source.complianceScore != null ? `${source.complianceScore} pts` : "—" },
    ],
  });

  // Tabela de pendências por categoria
  drawSemanticTable(ctx, {
    title: "Pendências por categoria",
    tone: "action",
    autoTable,
    head: [["Categoria", "Quantidade", "Status"]],
    body: [
      ["Críticos", String(source.summary.critical), source.summary.critical > 0 ? "Requer ação imediata" : "Sem ocorrências"],
      ["Altos", String(source.summary.high), source.summary.high > 0 ? "Prioridade alta" : "Sem ocorrências"],
      ["Médios", String(source.summary.medium), source.summary.medium > 0 ? "Monitoramento ativo" : "Sem ocorrências"],
      ["Documentação", String(source.summary.documents), source.summary.documents > 0 ? "Pendências documentais" : "Regularizado"],
      ["Saúde", String(source.summary.health), source.summary.health > 0 ? "Exames/EPIs pendentes" : "Regularizado"],
      ["Ações corretivas", String(source.summary.actions), source.summary.actions > 0 ? "Em andamento" : "Sem pendências"],
      ["SLA vencidos", String(source.summary.slaBreached), source.summary.slaBreached > 0 ? "Crítico — SLA extrapolado" : "Dentro do prazo"],
      ["Vencem hoje", String(source.summary.slaDueToday), source.summary.slaDueToday > 0 ? "Atenção imediata" : "Nenhum"],
    ],
    semanticRules: { profile: "audit", columns: [2] },
    overrides: {
      styles: { fontSize: 8, cellPadding: 2.3 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 28 } },
    },
  });

  // Tabela de aprovações pendentes
  drawSemanticTable(ctx, {
    title: "Aprovações pendentes por módulo",
    tone: "default",
    autoTable,
    head: [["Módulo", "Aguardando aprovação"]],
    body: [
      ["APRs", String(source.pendingApprovals.aprs)],
      ["PTs", String(source.pendingApprovals.pts)],
      ["Checklists", String(source.pendingApprovals.checklists)],
      ["Não conformidades", String(source.pendingApprovals.nonconformities)],
    ],
    semanticRules: { profile: "audit", columns: [1] },
    overrides: {
      styles: { fontSize: 8, cellPadding: 2.3 },
      columnStyles: { 0: { cellWidth: 80 } },
    },
  });

  // Conformidade por obra
  if (source.siteCompliance.length > 0) {
    drawSemanticTable(ctx, {
      title: "Conformidade por obra",
      tone: "action",
      autoTable,
      head: [["Obra / Setor", "Score", "Status"]],
      body: source.siteCompliance.map((s) => [
        s.siteName ?? "—",
        s.score != null ? `${s.score} pts` : "—",
        s.label ?? "—",
      ]),
      semanticRules: { profile: "audit", columns: [2] },
      overrides: {
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 24 } },
      },
    });
  }

  // Atividades recentes
  if (source.recentActivities.length > 0) {
    drawSemanticTable(ctx, {
      title: "Atividades registradas no período",
      tone: "default",
      autoTable,
      head: [["Tipo", "Título", "Responsável", "Horário"]],
      body: source.recentActivities.slice(0, 15).map((a) => [
        resolveActivityType(a.type),
        a.title ?? a.description ?? "—",
        a.user ?? "—",
        a.timestamp ? format(new Date(a.timestamp), "HH:mm", { locale: ptBR }) : "—",
      ]),
      semanticRules: { profile: "audit", columns: [1] },
      overrides: {
        styles: { fontSize: 7.5, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 40 }, 3: { cellWidth: 18 } },
      },
    });
  }

  // Resumo de riscos
  const riskTotal = source.riskSummary.alto + source.riskSummary.medio + source.riskSummary.baixo;
  drawNarrativeSection(ctx, {
    title: "Resumo de riscos ativos",
    content: riskTotal > 0
      ? `${source.riskSummary.alto} risco(s) alto(s), ${source.riskSummary.medio} médio(s) e ${source.riskSummary.baixo} baixo(s) catalogados no sistema. Total: ${riskTotal} riscos ativos.`
      : "Nenhum risco ativo registrado no sistema para o período analisado.",
  });

  applyFooterGovernance(ctx, {
    code,
    generatedAt: format(new Date(source.generatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
    draft: false,
  });

  const filename = `Relatorio_Diario_SGS_${source.generatedAt.slice(0, 10)}.pdf`;

  if (options.save) {
    doc.save(filename);
    return null;
  }

  if (options.output === "base64") {
    return {
      filename,
      base64: pdfDocToBase64(doc as unknown as PdfOutputDoc),
    };
  }

  return null;
}
