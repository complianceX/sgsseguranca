import type { Training } from "@/services/trainingsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
  drawSemanticTable,
} from "../components";

export async function drawTrainingBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  training: Training,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const expiryDate = training.data_vencimento ? new Date(training.data_vencimento) : null;
  const now = new Date();
  const remainingDays = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
  const isExpired = remainingDays !== null && remainingDays < 0;
  const isExpiringSoon = remainingDays !== null && remainingDays >= 0 && remainingDays <= 30;
  const statusLabel = isExpired
    ? "Vencido"
    : isExpiringSoon
      ? `Vence em ${remainingDays} dias`
      : "Valido";

  drawDocumentIdentityRail(ctx, {
    documentType: "Treinamento",
    criticality: isExpired ? "high" : isExpiringSoon ? "moderate" : "low",
    validity: formatDate(training.data_vencimento),
    documentClass: "training",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo de conformidade",
    summary:
      "Leitura objetiva da validade do treinamento, colaborador impactado e potencial bloqueio operacional associado.",
    metrics: [
      { label: "Status", value: statusLabel, tone: isExpired ? "danger" : isExpiringSoon ? "warning" : "success" },
      { label: "Colaborador", value: sanitize(training.user?.nome), tone: "default" },
      { label: "NR/Codigo", value: sanitize(training.nr_codigo), tone: "info" },
      { label: "Carga horaria", value: training.carga_horaria ? `${training.carga_horaria}h` : "-", tone: "default" },
      { label: "Obrigatorio", value: training.obrigatorio_para_funcao ? "Sim" : "Nao", tone: training.obrigatorio_para_funcao ? "warning" : "default" },
      {
        label: "Bloqueia operacao",
        value: training.bloqueia_operacao_quando_vencido ? "Sim" : "Nao",
        tone: training.bloqueia_operacao_quando_vencido ? "danger" : "default",
      },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificacao do treinamento",
    columns: 2,
    fields: [
      { label: "Treinamento", value: training.nome },
      { label: "Colaborador", value: training.user?.nome },
      { label: "NR/Codigo", value: training.nr_codigo },
      { label: "Empresa", value: training.company_id },
      { label: "Conclusao", value: formatDate(training.data_conclusao) },
      { label: "Vencimento", value: formatDate(training.data_vencimento) },
      { label: "Carga horaria", value: training.carga_horaria ? `${training.carga_horaria}h` : "-" },
      { label: "Auditor", value: training.auditado_por?.nome || "-" },
      { label: "Data auditoria", value: formatDate(training.data_auditoria) },
      { label: "Obrigatorio para funcao", value: training.obrigatorio_para_funcao ? "Sim" : "Nao" },
    ],
  });

  drawSemanticTable(ctx, {
    title: "Controle de validade e bloqueio",
    tone: "attendance",
    autoTable,
    head: [["Status", "Conclusao", "Vencimento", "Bloqueio operacional", "Restante"]],
    body: [[
      statusLabel,
      formatDate(training.data_conclusao),
      formatDate(training.data_vencimento),
      training.bloqueia_operacao_quando_vencido ? "Sim" : "Nao",
      remainingDays === null ? "-" : `${remainingDays} dias`,
    ]],
    semanticRules: { profile: "audit", columns: [0, 2, 3, 4] },
  });

  drawNarrativeSection(ctx, {
    title: "Certificado / referencia",
    content: training.certificado_url || "Nao informado.",
  });

  if (training.notas_auditoria) {
    drawNarrativeSection(ctx, {
      title: "Notas de auditoria",
      content: training.notas_auditoria,
    });
  }

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
    title: "Governanca e comprovacao documental",
    subtitle: "Valide a autenticidade por QR Code ou codigo no portal publico.",
  });
}
