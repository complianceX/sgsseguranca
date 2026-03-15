import type { Checklist } from "@/services/checklistsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentHeader,
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawSemanticTable,
} from "../components";

function isConforme(status: unknown): boolean {
  return status === true || status === "ok" || status === "sim" || status === "conforme";
}

function isNaoConforme(status: unknown): boolean {
  return status === false || status === "nok" || status === "nao";
}

function statusLabel(status: boolean | string | undefined): string {
  if (status === true || status === "ok" || status === "sim" || status === "conforme") return "Conforme";
  if (status === false || status === "nok" || status === "nao") return "Nao Conforme";
  if (status === "na") return "N/A";
  return sanitize(status as string);
}

export async function drawChecklistBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  checklist: Checklist,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const totalItems = checklist.itens?.length ?? 0;
  const conformes = checklist.itens?.filter((item) => isConforme(item.status)).length ?? 0;
  const naoConformes = checklist.itens?.filter((item) => isNaoConforme(item.status)).length ?? 0;
  const score = totalItems > 0 ? Math.round((conformes / totalItems) * 100) : 0;

  drawDocumentHeader(ctx, {
    title: "CHECKLIST DE INSPECAO",
    subtitle: "Conformidade operacional e rastreabilidade de campo",
    code,
    date: formatDate(checklist.data),
    status: sanitize(checklist.status),
    version: "1",
    company: sanitize(checklist.company?.razao_social),
    site: sanitize(checklist.site?.nome),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "Checklist",
    criticality: naoConformes > 0 ? "high" : "low",
    validity: formatDate(checklist.data),
    documentClass: "operational",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Resumo executivo de conformidade",
    summary: "Leitura rapida para operacao e gestao, com destaque para score, pendencias e nao conformidades.",
    metrics: [
      { label: "Status", value: sanitize(checklist.status), tone: naoConformes > 0 ? "warning" : "success" },
      { label: "Score", value: `${score}%`, tone: score >= 90 ? "success" : score >= 70 ? "warning" : "danger" },
      { label: "Itens", value: totalItems, tone: "info" },
      { label: "Conformes", value: conformes, tone: "success" },
      { label: "Nao conformes", value: naoConformes, tone: naoConformes > 0 ? "danger" : "success" },
      { label: "Inspetor", value: sanitize(checklist.inspetor?.nome), tone: "default" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Contexto do checklist",
    columns: 2,
    fields: [
      { label: "Titulo", value: checklist.titulo },
      { label: "Categoria", value: checklist.categoria },
      { label: "Data", value: formatDate(checklist.data) },
      { label: "Inspetor", value: checklist.inspetor?.nome },
      { label: "Site/Obra", value: checklist.site?.nome },
      { label: "Equipamento", value: checklist.equipamento || checklist.maquina },
      { label: "Periodicidade", value: checklist.periodicidade },
      { label: "Indicadores", value: `${conformes}/${totalItems} conformes` },
    ],
  });

  if (checklist.itens?.length) {
    drawSemanticTable(ctx, {
      title: `Itens avaliados (${checklist.itens.length})`,
      tone: "default",
      autoTable,
      head: [["#", "Item", "Tipo", "Status", "Observacao"]],
      body: checklist.itens.map((item, index) => [
        index + 1,
        sanitize(item.item),
        sanitize(item.tipo_resposta?.replace("_", "/") ?? "Sim/Nao"),
        statusLabel(item.status),
        sanitize(item.observacao),
      ]),
      semanticRules: { profile: "checklist", columns: [3] },
      overrides: {
        styles: { fontSize: 7.8, cellPadding: 2.2 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 64 },
          2: { cellWidth: 26 },
          3: { cellWidth: 28 },
        },
      },
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
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
