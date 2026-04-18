import type { Apr } from "@/services/aprsService";
import type { Signature } from "@/services/signaturesService";
import type { CellHookData, HookData } from "jspdf-autotable";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import { ensureSpace, moveY } from "../core/grid";
import {
  drawEvidenceGallery,
  drawGovernanceClosingBlock,
} from "../components";
import { drawRiskTable } from "../tables";

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
  lesao?: string;
  possiveis_lesoes?: string;
  medidas_prevencao?: string;
  responsavel?: string;
  prazo?: string;
  status_acao?: string;
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
  lesao?: string;
  probabilidade?: string | number;
  severidade?: string | number;
  score_risco?: string | number;
  categoria_risco?: string;
  prioridade?: string;
  medidas_prevencao?: string;
  responsavel?: string;
  prazo?: string;
  status_acao?: string;
};

type AprParticipantLike = { nome?: string };

const APR_TEAL: [number, number, number] = [0, 128, 128];
const APR_TEAL_SOFT: [number, number, number] = [255, 255, 255];
const APR_HEADER_GRAY: [number, number, number] = [217, 217, 217];
const APR_ACCEPTABLE: [number, number, number] = [0, 176, 80];
const APR_ATTENTION: [number, number, number] = [0, 112, 192];
const APR_SUBSTANTIAL: [number, number, number] = [255, 192, 0];
const APR_CRITICAL: [number, number, number] = [255, 0, 0];
const APR_DARK: [number, number, number] = [0, 0, 0];
const APR_WHITE: [number, number, number] = [255, 255, 255];

function normalizeRiskLabel(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function drawAprOperationalHeader(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  apr: Apr,
) {
  const { doc, margin, contentWidth, theme } = ctx;
  const titleHeight = 18;
  const tableWidth = contentWidth - 4;
  const title = "APR - ANÁLISE PRELIMINAR DE RISCOS";
  const responsible =
    apr.aprovado_por?.nome ||
    apr.elaborador?.nome ||
    apr.elaborador_id ||
    "-";
  const activityDescription = [
    apr.titulo,
    apr.descricao ? `- ${apr.descricao}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  ensureSpace(ctx, 34);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.18);
  doc.rect(margin, ctx.y, tableWidth + 4, titleHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(title, margin + (tableWidth + 4) / 2, ctx.y + 11.2, {
    align: "center",
  });

  autoTable(doc, {
    startY: ctx.y + titleHeight,
    margin: {
      left: margin,
      right: margin,
      top: ctx.pageTop ?? margin,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
      overflow: "linebreak",
      valign: "middle",
    },
    body: [
      [
        "Descrição da atividade:",
        sanitize(activityDescription),
        "Empresa:",
        sanitize(apr.company?.razao_social || apr.company_id),
      ],
      [
        "Data de elaboração:",
        formatDate(apr.created_at || apr.data_inicio),
        "CNPJ:",
        sanitize(apr.company?.cnpj),
      ],
      [
        "Data revisão/ versão:",
        `${formatDate(apr.updated_at || apr.data_inicio)} / v${apr.versao ?? 1}`,
        "Responsável:",
        sanitize(responsible),
      ],
      [
        "Site / obra:",
        sanitize(apr.site?.nome || apr.site_id),
        "Validade:",
        `${formatDate(apr.data_inicio)} a ${formatDate(apr.data_fim)}`,
      ],
    ],
    columnStyles: {
      0: { cellWidth: 40, fillColor: APR_TEAL, textColor: APR_WHITE, fontStyle: "bold" },
      1: { cellWidth: 111 },
      2: { cellWidth: 24, fillColor: APR_TEAL, textColor: APR_WHITE, fontStyle: "bold" },
      3: { cellWidth: tableWidth + 4 - 40 - 111 - 24 },
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 5 : ctx.y + 5;
    },
  });
}

function drawAprComplementaryInfo(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  apr: Apr,
) {
  const notes = [
    apr.control_description ? `Controles globais: ${apr.control_description}` : "",
    apr.residual_risk ? `Risco residual: ${apr.residual_risk}` : "",
    apr.evidence_document ? `Evidência documental: ${apr.evidence_document}` : "",
    apr.evidence_photo ? `Evidência fotográfica: ${apr.evidence_photo}` : "",
    apr.participants?.length ? `Participantes: ${apr.participants.length}` : "",
    apr.activities?.length ? `Atividades vinculadas: ${apr.activities.length}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  if (!notes || notes === "-") return;

  const { doc, margin, contentWidth, theme } = ctx;
  ensureSpace(ctx, 18);
  doc.setDrawColor(120, 120, 120);
  doc.setFillColor(...APR_TEAL_SOFT);
  doc.roundedRect(margin, ctx.y, contentWidth, 8.6, 1.6, 1.6, "FD");
  doc.setFillColor(...APR_TEAL);
  doc.rect(margin, ctx.y, 2.3, 8.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...APR_DARK);
  doc.text("Informações complementares", margin + 4, ctx.y + 5.7);
  moveY(ctx, 9.6);

  autoTable(doc, {
    startY: ctx.y,
    margin: {
      left: margin,
      right: margin,
      top: ctx.pageTop ?? margin,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
      overflow: "linebreak",
    },
    body: [[sanitize(notes)]],
    columnStyles: {
      0: { cellWidth: contentWidth },
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 4 : ctx.y + 4;
    },
  });
}

function drawAprRiskMatrixReference(ctx: PdfContext, autoTable: AutoTableFn) {
  const { doc, margin, contentWidth, theme } = ctx;
  ensureSpace(ctx, 86);

  doc.setDrawColor(120, 120, 120);
  doc.setFillColor(...APR_TEAL_SOFT);
  doc.roundedRect(margin, ctx.y, contentWidth, 8.6, 1.6, 1.6, "FD");
  doc.setFillColor(...APR_TEAL);
  doc.rect(margin, ctx.y, 2.3, 8.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...APR_DARK);
  doc.text("Matriz de risco e critério de ação", margin + 4, ctx.y + 5.7);
  moveY(ctx, 9.8);

  autoTable(doc, {
    startY: ctx.y,
    margin: { left: margin, right: margin, top: ctx.pageTop ?? margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
      halign: "center",
      valign: "middle",
    },
    head: [[
      "",
      "1\nInsignificante\nSem lesão relevante.",
      "2\nMenor\nPrimeiros socorros.",
      "3\nModerada\nAfastamento reversível.",
      "4\nGrave\nLesão permanente parcial.",
      "5\nCatastrófica\nMorte ou múltiplas vítimas.",
    ]],
    body: [[
      "Severidade",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]],
    columnStyles: {
      0: { cellWidth: 28, fillColor: APR_HEADER_GRAY, fontStyle: "bold" },
      1: { cellWidth: 31, fillColor: [44, 184, 162], textColor: APR_DARK, fontStyle: "bold" },
      2: { cellWidth: 31, fillColor: [39, 183, 163], textColor: APR_DARK, fontStyle: "bold" },
      3: { cellWidth: 31, fillColor: [35, 182, 164], textColor: APR_DARK, fontStyle: "bold" },
      4: { cellWidth: 31, fillColor: [31, 179, 162], textColor: APR_DARK, fontStyle: "bold" },
      5: { cellWidth: 31, fillColor: [26, 176, 160], textColor: APR_DARK, fontStyle: "bold" },
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 3 : ctx.y + 3;
    },
  });

  autoTable(doc, {
    startY: ctx.y,
    margin: { left: margin, right: margin, top: ctx.pageTop ?? margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
      halign: "center",
      valign: "middle",
    },
    head: [[
      "Probabilidade",
      "Descrição",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]],
    body: [
      ["1", "Improvável\nRaramente esperada", "Aceitável", "Aceitável", "Aceitável", "Aceitável", "Atenção"],
      ["2", "Remota\nSituação excepcional", "Aceitável", "Aceitável", "Atenção", "Atenção", "Substancial"],
      ["3", "Ocasional\nPode ocorrer", "Aceitável", "Atenção", "Atenção", "Substancial", "Substancial"],
      ["4", "Provável\nTendência de ocorrência", "Aceitável", "Atenção", "Substancial", "Substancial", "Crítico"],
      ["5", "Frequente\nOcorrência repetida", "Atenção", "Substancial", "Substancial", "Crítico", "Crítico"],
    ],
    columnStyles: {
      0: { cellWidth: 14, fillColor: APR_HEADER_GRAY, fontStyle: "bold" },
      1: { cellWidth: 32, fillColor: [245, 245, 245], fontStyle: "bold" },
      2: { cellWidth: 24 },
      3: { cellWidth: 24 },
      4: { cellWidth: 24 },
      5: { cellWidth: 24 },
      6: { cellWidth: 24 },
    },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== "body") return;
      const value = normalizeRiskLabel(hookData.cell.raw);
      if (value.includes("aceit")) {
        hookData.cell.styles.fillColor = APR_ACCEPTABLE;
        hookData.cell.styles.textColor = APR_WHITE;
        hookData.cell.styles.fontStyle = "bold";
      } else if (value.includes("aten")) {
        hookData.cell.styles.fillColor = APR_ATTENTION;
        hookData.cell.styles.textColor = APR_WHITE;
        hookData.cell.styles.fontStyle = "bold";
      } else if (value.includes("subst")) {
        hookData.cell.styles.fillColor = APR_SUBSTANTIAL;
        hookData.cell.styles.textColor = APR_DARK;
        hookData.cell.styles.fontStyle = "bold";
      } else if (value.includes("crit")) {
        hookData.cell.styles.fillColor = APR_CRITICAL;
        hookData.cell.styles.textColor = APR_DARK;
        hookData.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 3 : ctx.y + 3;
    },
  });

  autoTable(doc, {
    startY: ctx.y,
    margin: { left: margin, right: margin, top: ctx.pageTop ?? margin },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.2,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: [20, 20, 20],
      overflow: "linebreak",
    },
    body: [
      ["Aceitável", "NÃO PRIORITÁRIO - Não são requeridos controles adicionais. A condição pode permanecer dentro dos parâmetros verificados."],
      ["Atenção", "PRIORIDADE BÁSICA - Reavaliar os meios de controle e, quando necessário, adotar medidas complementares."],
      ["Substancial", "PRIORIDADE PREFERENCIAL - O trabalho não deve ser iniciado até que o risco tenha sido reduzido."],
      ["Crítico", "PRIORIDADE MÁXIMA - Interromper o processo ou atividade e estabelecer ações imediatas de controle."],
    ],
    columnStyles: {
      0: { cellWidth: 36, fontStyle: "bold", halign: "center" },
      1: { cellWidth: contentWidth - 36 },
    },
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section !== "body" || hookData.column.index !== 0) return;
      const value = normalizeRiskLabel(hookData.cell.raw);
      if (value.includes("aceit")) {
        hookData.cell.styles.fillColor = APR_ACCEPTABLE;
        hookData.cell.styles.textColor = APR_WHITE;
      } else if (value.includes("aten")) {
        hookData.cell.styles.fillColor = APR_ATTENTION;
        hookData.cell.styles.textColor = APR_WHITE;
      } else if (value.includes("subst")) {
        hookData.cell.styles.fillColor = APR_SUBSTANTIAL;
        hookData.cell.styles.textColor = APR_DARK;
      } else if (value.includes("crit")) {
        hookData.cell.styles.fillColor = APR_CRITICAL;
        hookData.cell.styles.textColor = APR_DARK;
      }
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 5 : ctx.y + 5;
    },
  });
}

function drawAprParticipantRoster(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  participants: Array<{ name?: string }>,
) {
  if (!participants.length) return;
  const { doc, margin, contentWidth, theme } = ctx;
  ensureSpace(ctx, 26);

  doc.setDrawColor(120, 120, 120);
  doc.setFillColor(...APR_TEAL_SOFT);
  doc.roundedRect(margin, ctx.y, contentWidth, 8.6, 1.6, 1.6, "FD");
  doc.setFillColor(...APR_ATTENTION);
  doc.rect(margin, ctx.y, 2.3, 8.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(theme.typography.headingSm);
  doc.setTextColor(...APR_DARK);
  doc.text(`Equipe participante (${participants.length})`, margin + 4, ctx.y + 5.7);
  moveY(ctx, 9.8);

  autoTable(doc, {
    startY: ctx.y,
    margin: {
      left: margin,
      right: margin,
      top: ctx.pageTop ?? margin,
    },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 1.8,
      lineColor: [0, 0, 0],
      lineWidth: 0.12,
      textColor: APR_DARK,
      overflow: "linebreak",
      valign: "middle",
    },
    head: [["#", "Nome do participante"]],
    body: participants.map((participant, index) => [index + 1, sanitize(participant.name)]),
    headStyles: {
      fillColor: APR_ATTENTION,
      textColor: APR_WHITE,
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: [244, 249, 255],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      1: { cellWidth: contentWidth - 12 },
    },
    didDrawPage: (hookData: HookData) => {
      ctx.y = hookData.cursor?.y ? hookData.cursor.y + 5 : ctx.y + 5;
    },
  });
}

export function resolveAprRiskRows(apr: Apr) {
  const structuredRows = Array.isArray(apr.risk_items) ? apr.risk_items : [];
  if (structuredRows.length > 0) {
    return structuredRows.map((item: AprStructuredRiskRow) => ({
      activity: [item.atividade].filter(Boolean).join(" | "),
      agent: item.agente_ambiental,
      condition: item.condicao_perigosa,
      hazard: [
        item.agente_ambiental ? `Agente: ${item.agente_ambiental}` : "",
        item.condicao_perigosa ? `Condição: ${item.condicao_perigosa}` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      source: item.fonte_circunstancia,
      injuries: item.lesao,
      probability: item.probabilidade,
      severity: item.severidade,
      score: item.score_risco,
      level: item.categoria_risco || item.prioridade,
      control: [item.medidas_prevencao].filter(Boolean).join(" • "),
      owner: item.responsavel,
      dueAndStatus: [item.prazo ? formatDate(item.prazo) : "", item.status_acao]
        .filter(Boolean)
        .join(" • "),
    }));
  }

  const matrixRows = Array.isArray(apr.itens_risco)
    ? (apr.itens_risco as AprRiskRowSource[])
    : [];

  return matrixRows.map((item) => ({
    activity: [item.atividade || item.atividade_processo].filter(Boolean).join(" | "),
    agent: item.agente_ambiental,
    condition: item.condicao_perigosa,
    hazard: [
      item.agente_ambiental ? `Agente: ${item.agente_ambiental}` : "",
      item.condicao_perigosa ? `Condição: ${item.condicao_perigosa}` : "",
    ]
      .filter(Boolean)
      .join(" • "),
    source: item.fonte_circunstancia || item.fontes_circunstancias,
    injuries: item.lesao || item.possiveis_lesoes,
    probability: item.probabilidade,
    severity: item.severidade,
    score:
      item.score_risco ||
      (item.probabilidade && item.severidade
        ? Number(item.probabilidade) * Number(item.severidade)
        : ""),
    level: item.categoria_risco || item.prioridade,
    control: [
      item.medidas_prevencao ? `Medidas: ${item.medidas_prevencao}` : "",
      item.responsavel ? `Responsável: ${item.responsavel}` : "",
      item.prazo ? `Prazo: ${formatDate(item.prazo)}` : "",
      item.status_acao ? `Status: ${item.status_acao}` : "",
    ]
      .filter(Boolean)
      .join(" • "),
    owner: item.responsavel,
    dueAndStatus: [item.prazo ? formatDate(item.prazo) : "", item.status_acao]
      .filter(Boolean)
      .join(" • "),
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
  const riskRows = resolveAprRiskRows(apr);
  drawAprOperationalHeader(ctx, autoTable, apr);

  drawRiskTable(
    ctx,
    autoTable,
    riskRows,
    { semanticRules: { profile: "apr" } },
  );

  drawAprComplementaryInfo(ctx, autoTable, apr);
  drawAprRiskMatrixReference(ctx, autoTable);

  drawAprParticipantRoster(
    ctx,
    autoTable,
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
    accentColor: APR_TEAL,
    accentSoftColor: [240, 249, 248],
  });
}
