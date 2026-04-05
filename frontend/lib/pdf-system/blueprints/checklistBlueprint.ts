import type { Checklist } from "@/services/checklistsService";
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

function toAlphabeticalLabel(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let current = Math.max(index, 0);
  let label = "";

  do {
    label = alphabet[current % 26] + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return `${label})`;
}

function groupChecklistItems(checklist: Checklist) {
  if (Array.isArray(checklist.topicos) && checklist.topicos.length > 0) {
    return checklist.topicos.map((topico) => ({
      titulo: sanitize(topico.titulo || "Tópico"),
      itens: Array.isArray(topico.itens) ? topico.itens : [],
    }));
  }

  const items = Array.isArray(checklist.itens) ? checklist.itens : [];
  const groups = new Map<string, { titulo: string; itens: Checklist["itens"] }>();

  items.forEach((item) => {
    const key = item.topico_id || item.topico_titulo || "legacy-topic";
    if (!groups.has(key)) {
      groups.set(key, {
        titulo: sanitize(item.topico_titulo || "Estrutura principal"),
        itens: [],
      });
    }
    groups.get(key)?.itens.push(item);
  });

  return Array.from(groups.values());
}

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
  const groupedItems = groupChecklistItems(checklist);
  const flattenedItems = groupedItems.flatMap((group) => group.itens);
  const totalItems = flattenedItems.length;
  const conformes = flattenedItems.filter((item) => isConforme(item.status)).length ?? 0;
  const naoConformes = flattenedItems.filter((item) => isNaoConforme(item.status)).length ?? 0;
  const score = totalItems > 0 ? Math.round((conformes / totalItems) * 100) : 0;

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
      { label: "Topicos", value: groupedItems.length || 1 },
      { label: "Indicadores", value: `${conformes}/${totalItems} conformes` },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Escopo e observacoes gerais",
    content: checklist.descricao,
  });

  if (flattenedItems.length) {
    groupedItems.forEach((group, groupIndex) => {
      const groupItems = Array.isArray(group.itens) ? group.itens : [];
      if (!groupItems.length) {
        return;
      }

      const groupConformes = groupItems.filter((item) =>
        isConforme(item.status),
      ).length;
      const groupNaoConformes = groupItems.filter((item) =>
        isNaoConforme(item.status),
      ).length;

      drawSemanticTable(ctx, {
        title: `${group.titulo || `Topico ${groupIndex + 1}`} (${groupConformes}/${groupItems.length} conformes)`,
        tone: groupNaoConformes > 0 ? "risk" : "default",
        autoTable,
        head: [["Item avaliado", "Tipo", "Status", "Observacao"]],
        body: groupItems.map((item, index) => {
          const subitems = Array.isArray(item.subitens) ? item.subitens : [];
          const itemLabel = [
            `${item.ordem_item || index + 1}. ${sanitize(item.item)}`,
            ...subitems.map(
              (subitem, subitemIndex) =>
                `${toAlphabeticalLabel(subitemIndex)} ${sanitize(subitem.texto)}`,
            ),
          ]
            .filter((value) => value.trim().length > 0)
            .join("\n");

          return [
            itemLabel,
            sanitize(item.tipo_resposta?.replace(/_/g, " / ") ?? "Sim / Nao"),
            statusLabel(item.status),
            sanitize(item.observacao),
          ];
        }),
        semanticRules: { profile: "checklist", columns: [2] },
        overrides: {
          tableWidth: ctx.contentWidth - 8,
          styles: { fontSize: 7.7, cellPadding: 2.1 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 20 },
            2: { cellWidth: 22 },
            3: { cellWidth: 48 },
          },
        },
      });
    });
  }

  const SIGNATURE_TYPE_LABEL: Record<string, string> = {
    digital: 'Assinatura Digital',
    upload: 'Imagem Enviada',
    facial: 'Facial',
    hmac: 'PIN Seguro (HMAC-SHA256)',
  };

  await drawGovernanceClosingBlock(ctx, {
    signatures: signatures.map((signature) => ({
      label: SIGNATURE_TYPE_LABEL[signature.type] ?? sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: SIGNATURE_TYPE_LABEL[signature.type] ?? sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      // For HMAC, signature_data is a hex string — mark it so GovernanceClosingBlock handles it correctly
      image: signature.signature_data,
      signatureType: signature.type,
    })),
    code,
    url: validationUrl,
    title: "Governanca e autenticidade",
    subtitle: "Valide por QR Code ou codigo no portal publico.",
  });
}
