import type { Rdo } from "@/services/rdosService";
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

type RdoSignature = {
  label: string;
  name: string;
  role: string;
  date?: string;
  image?: string | null;
};

function buildClimateLabel(value?: string | null) {
  const labels: Record<string, string> = {
    ensolarado: "Ensolarado",
    nublado: "Nublado",
    chuvoso: "Chuvoso",
    parcialmente_nublado: "Parcialmente nublado",
  };

  return sanitize(labels[value || ""] || value || "-");
}

function buildLocationLabel(rdo: Rdo) {
  const city = rdo.site?.cidade?.trim();
  const state = rdo.site?.estado?.trim();

  if (city && state) return `${city}/${state}`;
  if (city) return city;
  if (state) return state;
  return "-";
}

function buildSiteLine(rdo: Rdo) {
  const site = rdo.site?.nome?.trim();
  const location = buildLocationLabel(rdo);

  if (site && location !== "-") {
    return `${site} - ${location}`;
  }

  return site || location;
}

function buildStatusTone(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("aprov")) return "success" as const;
  if (normalized.includes("envi")) return "info" as const;
  if (normalized.includes("rascun")) return "warning" as const;
  return "default" as const;
}

function buildCriticality(rdo: Rdo) {
  if (rdo.houve_acidente) return "high";
  if (rdo.houve_paralisacao) return "moderate";
  if (String(rdo.status || "").toLowerCase() === "aprovado") return "controlled";
  return "monitorado";
}

function buildTemperatureRange(rdo: Rdo) {
  if (rdo.temperatura_min == null && rdo.temperatura_max == null) {
    return "-";
  }

  const min = rdo.temperatura_min != null ? `${rdo.temperatura_min} C` : "-";
  const max = rdo.temperatura_max != null ? `${rdo.temperatura_max} C` : "-";
  return `${min} a ${max}`;
}

function buildOperationalSummary(rdo: Rdo) {
  const segments = [
    `Registro operacional do dia ${formatDate(rdo.data)} para ${sanitize(buildSiteLine(rdo))}.`,
    `Status atual: ${sanitize(rdo.status)}.`,
    `Responsavel principal: ${sanitize(rdo.responsavel?.nome)}.`,
    `Mobilizacao registrada com ${(rdo.mao_de_obra || []).reduce((sum, item) => sum + (item.quantidade || 0), 0)} trabalhador(es), ${(rdo.equipamentos || []).length} equipamento(s) e ${(rdo.servicos_executados || []).length} servico(s) executado(s).`,
  ];

  if (rdo.houve_acidente) {
    segments.push("Ha registro de acidente e o fechamento deste documento exige leitura prioritaria.");
  }

  if (rdo.houve_paralisacao) {
    segments.push(
      `Houve paralisacao operacional${rdo.motivo_paralisacao ? ` por ${sanitize(rdo.motivo_paralisacao)}` : ""}.`,
    );
  }

  return segments.join(" ");
}

export async function drawRdoBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  rdo: Rdo,
  signatures: RdoSignature[],
  code: string,
  validationUrl: string,
) {
  const totalWorkers = (rdo.mao_de_obra || []).reduce(
    (sum, item) => sum + (item.quantidade || 0),
    0,
  );
  const totalEquipment = (rdo.equipamentos || []).length;
  const totalMaterials = (rdo.materiais_recebidos || []).length;
  const totalServices = (rdo.servicos_executados || []).length;
  const totalOccurrences = (rdo.ocorrencias || []).length;
  const statusTone = buildStatusTone(rdo.status);

  drawDocumentIdentityRail(ctx, {
    documentType: "RDO",
    criticality: buildCriticality(rdo),
    validity: formatDate(rdo.data),
    documentClass: "operational",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Leitura executiva do dia",
    summary:
      "Painel sintetico para acompanhamento rapido da obra, com status, lideranca responsavel e volume operacional registrado no periodo.",
    metrics: [
      { label: "Status", value: sanitize(rdo.status), tone: statusTone },
      {
        label: "Responsavel",
        value: sanitize(rdo.responsavel?.nome),
        tone: "default",
      },
      { label: "Trabalhadores", value: totalWorkers, tone: totalWorkers > 0 ? "success" : "warning" },
      { label: "Equipamentos", value: totalEquipment, tone: totalEquipment > 0 ? "info" : "default" },
      { label: "Servicos", value: totalServices, tone: totalServices > 0 ? "success" : "default" },
      {
        label: "Ocorrencias",
        value: totalOccurrences,
        tone: totalOccurrences > 0 || rdo.houve_acidente ? "warning" : "default",
      },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Identificacao do documento",
    columns: 2,
    fields: [
      { label: "Numero do RDO", value: rdo.numero },
      { label: "Data do registro", value: formatDate(rdo.data) },
      { label: "Obra/Unidade", value: rdo.site?.nome || rdo.site_id },
      { label: "Cidade/UF", value: buildLocationLabel(rdo) },
      { label: "Empresa", value: rdo.company?.razao_social || rdo.company_id },
      { label: "Responsavel", value: rdo.responsavel?.nome || rdo.responsavel_id },
      { label: "Status operacional", value: rdo.status },
      { label: "Terreno", value: rdo.condicao_terreno || "-" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Condicoes operacionais do dia",
    columns: 3,
    fields: [
      { label: "Clima manha", value: buildClimateLabel(rdo.clima_manha) },
      { label: "Clima tarde", value: buildClimateLabel(rdo.clima_tarde) },
      { label: "Temperatura", value: buildTemperatureRange(rdo) },
      { label: "Acidente registrado", value: rdo.houve_acidente ? "Sim" : "Nao" },
      { label: "Paralisacao", value: rdo.houve_paralisacao ? "Sim" : "Nao" },
      { label: "Motivo da paralisacao", value: rdo.motivo_paralisacao || "-" },
      { label: "Materiais recebidos", value: totalMaterials },
      { label: "Servicos executados", value: totalServices },
      { label: "Ocorrencias", value: totalOccurrences },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Sintese operacional do dia",
    content: buildOperationalSummary(rdo),
  });

  if ((rdo.mao_de_obra || []).length > 0) {
    drawSemanticTable(ctx, {
      title: `Mao de obra mobilizada (${totalWorkers} trabalhador(es))`,
      autoTable,
      tone: "attendance",
      head: [["Funcao", "Quantidade", "Turno", "Horas"]],
      body: (rdo.mao_de_obra || []).map((item) => [
        sanitize(item.funcao),
        String(item.quantidade ?? 0),
        sanitize(item.turno),
        `${sanitize(item.horas ?? 0)} h`,
      ]),
      overrides: {
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles: {
          0: { cellWidth: 78 },
          1: { cellWidth: 24 },
          2: { cellWidth: 34 },
          3: { cellWidth: 28 },
        },
      },
    });
  }

  if ((rdo.equipamentos || []).length > 0) {
    drawSemanticTable(ctx, {
      title: `Equipamentos e disponibilidade (${totalEquipment})`,
      autoTable,
      tone: "default",
      head: [["Equipamento", "Qtd.", "H. trab.", "H. ociosas", "Observacao"]],
      body: (rdo.equipamentos || []).map((item) => [
        sanitize(item.nome),
        String(item.quantidade ?? 0),
        String(item.horas_trabalhadas ?? 0),
        String(item.horas_ociosas ?? 0),
        sanitize(item.observacao || "-"),
      ]),
      overrides: {
        styles: { fontSize: 7.8, cellPadding: 2.2 },
        columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 16 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 54 },
        },
      },
    });
  }

  if ((rdo.materiais_recebidos || []).length > 0) {
    drawSemanticTable(ctx, {
      title: `Materiais recebidos (${totalMaterials})`,
      autoTable,
      tone: "action",
      head: [["Descricao", "Unidade", "Quantidade", "Fornecedor"]],
      body: (rdo.materiais_recebidos || []).map((item) => [
        sanitize(item.descricao),
        sanitize(item.unidade),
        String(item.quantidade ?? 0),
        sanitize(item.fornecedor || "-"),
      ]),
      overrides: {
        styles: { fontSize: 7.8, cellPadding: 2.2 },
        columnStyles: {
          0: { cellWidth: 76 },
          1: { cellWidth: 24 },
          2: { cellWidth: 26 },
          3: { cellWidth: 46 },
        },
      },
    });
  }

  if ((rdo.servicos_executados || []).length > 0) {
    drawSemanticTable(ctx, {
      title: `Frentes e servicos executados (${totalServices})`,
      autoTable,
      tone: "action",
      head: [["Servico executado", "% concl.", "Observacao"]],
      body: (rdo.servicos_executados || []).map((item) => [
        sanitize(item.descricao),
        `${sanitize(item.percentual_concluido ?? 0)}%`,
        sanitize(item.observacao || "-"),
      ]),
      overrides: {
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles: {
          0: { cellWidth: 92 },
          1: { cellWidth: 24 },
          2: { cellWidth: 58 },
        },
      },
    });
  }

  if ((rdo.ocorrencias || []).length > 0) {
    drawSemanticTable(ctx, {
      title: `Ocorrencias e registros do dia (${totalOccurrences})`,
      autoTable,
      tone: "risk",
      head: [["Tipo", "Descricao", "Hora"]],
      body: (rdo.ocorrencias || []).map((item) => [
        sanitize(item.tipo),
        sanitize(item.descricao),
        sanitize(item.hora || "-"),
      ]),
      semanticRules: { columns: [0] },
      overrides: {
        styles: { fontSize: 8, cellPadding: 2.3 },
        columnStyles: {
          0: { cellWidth: 34 },
          1: { cellWidth: 106 },
          2: { cellWidth: 26 },
        },
      },
    });
  }

  drawNarrativeSection(ctx, {
    title: "Observacoes gerais",
    content: rdo.observacoes,
  });

  drawNarrativeSection(ctx, {
    title: "Programacao prevista para o proximo dia",
    content: rdo.programa_servicos_amanha,
  });

  await drawGovernanceClosingBlock(ctx, {
    signatures,
    code,
    url: validationUrl,
    title: "Fechamento oficial, assinaturas e autenticidade",
    subtitle:
      "Documento oficial de obra com validacao publica por QR Code e identificador documental.",
  });
}
