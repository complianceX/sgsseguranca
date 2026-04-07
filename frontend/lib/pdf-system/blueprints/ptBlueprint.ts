import type { Pt } from "@/services/ptsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawChecklistTable, drawParticipantTable } from "../tables";

type ChecklistItem = {
  pergunta?: string;
  resposta?: string;
  justificativa?: string;
};

type PtChecklistGroup = {
  title: string;
  enabled: boolean;
  items?: ChecklistItem[];
};

function hasMeaningfulChecklistContent(items?: ChecklistItem[]) {
  return (
    items?.some(
      (item) => Boolean(item.resposta) || Boolean(item.justificativa?.trim()),
    ) ?? false
  );
}

function resolveVisibleChecklistGroups(groups: PtChecklistGroup[]) {
  const hasSelectedActivity = groups.some((group) => group.enabled);

  return groups.filter((group) => {
    if (!group.items?.length) {
      return false;
    }

    if (group.enabled) {
      return true;
    }

    return !hasSelectedActivity && hasMeaningfulChecklistContent(group.items);
  });
}

export async function drawPtBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  pt: Pt,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const status = (pt.status || "").toLowerCase();
  const tone = status.includes("cancel")
    ? "danger"
    : status.includes("pend")
      ? "warning"
      : status.includes("aprov")
        ? "success"
        : "info";
  const visibleChecklistGroups = resolveVisibleChecklistGroups([
    {
      title: "Checklist trabalho em altura",
      enabled: Boolean(pt.trabalho_altura),
      items: pt.trabalho_altura_checklist as ChecklistItem[] | undefined,
    },
    {
      title: "Checklist trabalho elétrico",
      enabled: Boolean(pt.eletricidade),
      items: pt.trabalho_eletrico_checklist as ChecklistItem[] | undefined,
    },
    {
      title: "Checklist trabalho a quente",
      enabled: Boolean(pt.trabalho_quente),
      items: pt.trabalho_quente_checklist as ChecklistItem[] | undefined,
    },
    {
      title: "Checklist espaço confinado",
      enabled: Boolean(pt.espaco_confinado),
      items: pt.trabalho_espaco_confinado_checklist as
        | ChecklistItem[]
        | undefined,
    },
    {
      title: "Checklist escavação",
      enabled: Boolean(pt.escavacao),
      items: pt.trabalho_escavacao_checklist as ChecklistItem[] | undefined,
    },
  ]);
  const checklistTotal = visibleChecklistGroups.reduce(
    (total, group) => total + (group.items?.length || 0),
    0,
  );

  drawDocumentIdentityRail(ctx, {
    documentType: "PT",
    criticality: tone,
    validity: `${formatDate(pt.data_hora_inicio)} a ${formatDate(pt.data_hora_fim)}`,
    documentClass: "Permissão de Trabalho",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Liberação executiva",
    summary:
      "Documento de autorização para atividade crítica com requisitos mandatórios, checklist técnico e responsabilização formal.",
    metrics: [
      { label: "Número", value: sanitize(pt.numero), tone: "info" },
      { label: "Status", value: sanitize(pt.status), tone },
      {
        label: "Responsável",
        value: sanitize(pt.responsavel?.nome),
        tone: "default",
      },
      {
        label: "Executantes",
        value: pt.executantes?.length || 0,
        tone: "default",
      },
      {
        label: "Checklists",
        value: checklistTotal,
        tone: checklistTotal > 0 ? "warning" : "success",
      },
      { label: "Site", value: sanitize(pt.site?.nome), tone: "info" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Dados de liberação",
    columns: 2,
    fields: [
      { label: "Número", value: pt.numero },
      { label: "Título", value: pt.titulo },
      { label: "Responsável", value: pt.responsavel?.nome },
      { label: "Site/Obra", value: pt.site?.nome },
      { label: "Início", value: formatDate(pt.data_hora_inicio) },
      { label: "Fim", value: formatDate(pt.data_hora_fim) },
      { label: "Status", value: pt.status },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Categorias de trabalho autorizadas",
    columns: 3,
    fields: [
      {
        label: "Trabalho em altura",
        value: pt.trabalho_altura ? "Sim" : "Não",
      },
      { label: "Espaço confinado", value: pt.espaco_confinado ? "Sim" : "Não" },
      { label: "Trabalho a quente", value: pt.trabalho_quente ? "Sim" : "Não" },
      { label: "Eletricidade", value: pt.eletricidade ? "Sim" : "Não" },
      { label: "Escavação", value: pt.escavacao ? "Sim" : "Não" },
    ],
  });

  drawNarrativeSection(ctx, {
    title: "Escopo da atividade autorizada",
    content: pt.descricao,
  });

  drawParticipantTable(
    ctx,
    autoTable,
    `Equipe executante (${pt.executantes?.length || 0})`,
    (pt.executantes || []).map((executor) => ({ name: executor.nome })),
  );

  for (const group of visibleChecklistGroups) {
    const items = group.items ?? [];
    drawChecklistTable(
      ctx,
      autoTable,
      group.title,
      items.map((item) => ({
        question: item.pergunta,
        answer: item.resposta,
        justification: item.justificativa,
      })),
      { semanticRules: { profile: "pt", columns: [1] } },
    );
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
    title: "Governança, autenticidade e autorização",
    subtitle:
      "Documento válido para auditoria por QR code e identificador público.",
  });
}
