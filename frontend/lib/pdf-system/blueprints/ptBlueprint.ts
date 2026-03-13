import type { Pt } from "@/services/ptsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, sanitize } from "../core/format";
import {
  drawAuthoritySignatureBlock,
  drawDocumentHeader,
  drawDocumentIdentityRail,
  drawExecutiveSummaryStrip,
  drawIntegrityValidationBlock,
  drawMetadataGrid,
  drawNarrativeSection,
} from "../components";
import { drawChecklistTable, drawParticipantTable } from "../tables";

type ChecklistItem = { pergunta?: string; resposta?: string; justificativa?: string };

export async function drawPtBlueprint(
  ctx: PdfContext,
  autoTable: AutoTableFn,
  pt: Pt,
  signatures: Signature[],
  code: string,
  validationUrl: string,
) {
  const status = (pt.status || "").toLowerCase();
  const tone = status.includes("cancel") ? "danger" : status.includes("pend") ? "warning" : status.includes("aprov") ? "success" : "info";
  const checklistTotal =
    (pt.trabalho_altura_checklist?.length || 0) +
    (pt.trabalho_eletrico_checklist?.length || 0) +
    (pt.trabalho_quente_checklist?.length || 0) +
    (pt.trabalho_espaco_confinado_checklist?.length || 0) +
    (pt.trabalho_escavacao_checklist?.length || 0);

  drawDocumentHeader(ctx, {
    title: "PERMISSAO DE TRABALHO",
    subtitle: "Documento de liberacao operacional em SST",
    code,
    date: formatDate(pt.data_hora_inicio),
    status: sanitize(pt.status),
    version: "1",
    company: "-",
    site: sanitize(pt.site?.nome),
  });

  drawDocumentIdentityRail(ctx, {
    documentType: "PT",
    criticality: tone,
    validity: `${formatDate(pt.data_hora_inicio)} a ${formatDate(pt.data_hora_fim)}`,
    documentClass: "critical",
  });

  drawExecutiveSummaryStrip(ctx, {
    title: "Liberacao executiva",
    summary: "Documento de autorizacao para atividade critica com requisitos mandatarios, checklist tecnico e responsabilizacao formal.",
    metrics: [
      { label: "Numero", value: sanitize(pt.numero), tone: "info" },
      { label: "Status", value: sanitize(pt.status), tone },
      { label: "Responsavel", value: sanitize(pt.responsavel?.nome), tone: "default" },
      { label: "Executantes", value: pt.executantes?.length || 0, tone: "default" },
      { label: "Checklists", value: checklistTotal, tone: checklistTotal > 0 ? "warning" : "success" },
      { label: "Site", value: sanitize(pt.site?.nome), tone: "info" },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Dados de liberacao",
    columns: 2,
    fields: [
      { label: "Numero", value: pt.numero },
      { label: "Titulo", value: pt.titulo },
      { label: "Responsavel", value: pt.responsavel?.nome },
      { label: "Site/Obra", value: pt.site?.nome },
      { label: "Inicio", value: formatDate(pt.data_hora_inicio) },
      { label: "Fim", value: formatDate(pt.data_hora_fim) },
      { label: "Status", value: pt.status },
    ],
  });

  drawMetadataGrid(ctx, {
    title: "Categorias de trabalho autorizadas",
    columns: 3,
    fields: [
      { label: "Trabalho em altura", value: pt.trabalho_altura ? "Sim" : "Nao" },
      { label: "Espaco confinado", value: pt.espaco_confinado ? "Sim" : "Nao" },
      { label: "Trabalho a quente", value: pt.trabalho_quente ? "Sim" : "Nao" },
      { label: "Eletricidade", value: pt.eletricidade ? "Sim" : "Nao" },
      { label: "Escavacao", value: pt.escavacao ? "Sim" : "Nao" },
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

  const groups: Array<{ title: string; items?: ChecklistItem[] }> = [
    { title: "Checklist trabalho em altura", items: pt.trabalho_altura_checklist as ChecklistItem[] | undefined },
    { title: "Checklist trabalho eletrico", items: pt.trabalho_eletrico_checklist as ChecklistItem[] | undefined },
    { title: "Checklist trabalho a quente", items: pt.trabalho_quente_checklist as ChecklistItem[] | undefined },
    { title: "Checklist espaco confinado", items: pt.trabalho_espaco_confinado_checklist as ChecklistItem[] | undefined },
    { title: "Checklist escavacao", items: pt.trabalho_escavacao_checklist as ChecklistItem[] | undefined },
  ];

  for (const group of groups) {
    if (!group.items?.length) continue;
    drawChecklistTable(
      ctx,
      autoTable,
      group.title,
      group.items.map((item) => ({
        question: item.pergunta,
        answer: item.resposta,
        justification: item.justificativa,
      })),
    );
  }

  drawAuthoritySignatureBlock(ctx, {
    signatures: signatures.map((signature) => ({
      label: sanitize(signature.type),
      name: sanitize(signature.user?.nome || signature.type),
      role: sanitize(signature.type),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data,
    })),
  });

  await drawIntegrityValidationBlock(ctx, {
    code,
    url: validationUrl,
    title: "Governanca, autenticidade e autorizacao",
    subtitle: "Documento valido para auditoria por QR code e identificador publico.",
  });
}

