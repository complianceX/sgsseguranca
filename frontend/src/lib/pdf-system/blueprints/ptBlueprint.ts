import type { Pt } from "@/services/ptsService";
import type { Signature } from "@/services/signaturesService";
import type { AutoTableFn, PdfContext } from "../core/types";
import { formatDate, formatDateTime, sanitize } from "../core/format";
import {
  drawDocumentIdentityRail,
  drawEvidenceGallery,
  drawExecutiveSummaryStrip,
  drawGovernanceClosingBlock,
  drawMetadataGrid,
  drawNarrativeSection,
  drawSemanticTable,
} from "../components";
import { drawChecklistTable, drawParticipantTable } from "../tables";
import {
  resolveSignatureSignerName,
  resolveSignatureSignerRole,
  resolveSignatureTypeLabel,
} from "../signaturePresentation";

type ChecklistItem = {
  pergunta?: string;
  resposta?: string;
  justificativa?: string;
  section?: string;
};

type PtChecklistGroup = {
  title: string;
  enabled: boolean;
  items?: ChecklistItem[];
};

type RapidRiskChecklistItem = {
  pergunta?: string;
  secao?: "basica" | "adicional";
  resposta?: string;
};

type PtExecutorLike = { nome?: string; funcao?: string | null };

const PT_EVIDENCE_FASE_LABELS: Record<string, string> = {
  antes: "Antes da atividade",
  durante: "Durante a atividade",
  depois: "Depois da atividade",
};

export type PtBlueprintOptions = {
  /**
   * Resolve a foto de evidência no índice dado para um data URL inline.
   * Ausente (ex.: rascunho offline), a galeria degrada para placeholders.
   */
  resolveEvidencePhotoDataUrl?: (photoIndex: number) => Promise<string | null>;
};

function hasMeaningfulChecklistContent(items?: ChecklistItem[]) {
  return (
    items?.some(
      (item) => Boolean(item.resposta) || Boolean(item.justificativa?.trim()),
    ) ?? false
  );
}

function buildCriticality(pt: Pt): string {
  const hazardCount = [
    pt.trabalho_altura,
    pt.espaco_confinado,
    pt.trabalho_quente,
    pt.eletricidade,
    pt.escavacao,
  ].filter(Boolean).length;

  if (hazardCount >= 2) return "Crítica (atividades simultâneas)";
  if (hazardCount === 1) return "Alta";
  return "Padrão";
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
  options?: PtBlueprintOptions,
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
    criticality: buildCriticality(pt),
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

  const vigiaLabel = pt.vigia?.nome || pt.vigia_nome;
  const hasEmergencyInfo = Boolean(
    pt.contato_emergencia ||
      pt.ponto_encontro ||
      vigiaLabel ||
      pt.epis_obrigatorios?.length ||
      pt.plano_resgate,
  );
  if (hasEmergencyInfo) {
    drawMetadataGrid(ctx, {
      title: "Emergência, resgate e EPIs",
      columns: 2,
      fields: [
        { label: "Contato de emergência", value: pt.contato_emergencia },
        { label: "Ponto de encontro", value: pt.ponto_encontro },
        { label: "Vigia designado", value: vigiaLabel },
        {
          label: "EPIs obrigatórios",
          value: pt.epis_obrigatorios?.length
            ? pt.epis_obrigatorios.join(" • ")
            : undefined,
        },
      ],
    });
    if (pt.plano_resgate) {
      drawNarrativeSection(ctx, {
        title: "Plano de resgate",
        content: pt.plano_resgate,
      });
    }
  }

  drawNarrativeSection(ctx, {
    title: "Escopo da atividade autorizada",
    content: pt.descricao,
  });

  const rapidRiskItems = (pt.analise_risco_rapida_checklist ??
    []) as RapidRiskChecklistItem[];
  const rapidRiskSections: Array<{
    title: string;
    secao: "basica" | "adicional";
  }> = [
    { title: "Análise de risco rápida — Verificações", secao: "basica" },
    {
      title: "Análise de risco rápida — Verificações adicionais",
      secao: "adicional",
    },
  ];
  for (const section of rapidRiskSections) {
    const items = rapidRiskItems.filter(
      (item) => item.secao === section.secao,
    );
    if (!items.length) continue;
    drawChecklistTable(
      ctx,
      autoTable,
      section.title,
      items.map((item) => ({
        question: item.pergunta,
        answer: item.resposta,
      })),
      { semanticRules: { profile: "pt", columns: [1] } },
    );
  }
  if (pt.analise_risco_rapida_observacoes) {
    drawNarrativeSection(ctx, {
      title: "Análise de risco rápida — Observações",
      content: pt.analise_risco_rapida_observacoes,
    });
  }

  const recomendacoesItems = pt.recomendacoes_gerais_checklist ?? [];
  if (recomendacoesItems.length) {
    drawChecklistTable(
      ctx,
      autoTable,
      "Recomendações gerais",
      recomendacoesItems.map((item) => ({
        question: item.pergunta,
        answer: item.resposta,
        justification: item.justificativa,
      })),
      { semanticRules: { profile: "pt", columns: [1] } },
    );
  }

  drawParticipantTable(
    ctx,
    autoTable,
    `Equipe executante (${pt.executantes?.length || 0})`,
    (pt.executantes || []).map((executor: PtExecutorLike) => ({
      name: executor.nome,
      role: executor.funcao,
    })),
  );

  for (const group of visibleChecklistGroups) {
    const items = group.items ?? [];
    const sections = Array.from(
      new Set(items.map((item) => item.section).filter(Boolean)),
    ) as string[];

    if (sections.length) {
      for (const section of sections) {
        const sectionItems = items.filter((item) => item.section === section);
        drawChecklistTable(
          ctx,
          autoTable,
          `${group.title} — ${section}`,
          sectionItems.map((item) => ({
            question: item.pergunta,
            answer: item.resposta,
            justification: item.justificativa,
          })),
          { semanticRules: { profile: "pt", columns: [1] } },
        );
      }
      const unsectioned = items.filter((item) => !item.section);
      if (unsectioned.length) {
        drawChecklistTable(
          ctx,
          autoTable,
          group.title,
          unsectioned.map((item) => ({
            question: item.pergunta,
            answer: item.resposta,
            justification: item.justificativa,
          })),
          { semanticRules: { profile: "pt", columns: [1] } },
        );
      }
      continue;
    }

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

  if (pt.espaco_confinado && pt.medicoes_atmosfericas?.length) {
    drawSemanticTable(ctx, {
      title: "Medições atmosféricas (NR-33)",
      tone: "risk",
      autoTable,
      head: [
        [
          "#",
          "Hora",
          "O2 (%)",
          "LEL (%)",
          "CO (ppm)",
          "H2S (ppm)",
          "Instrumento",
          "Responsável",
        ],
      ],
      body: pt.medicoes_atmosfericas.map((reading, index) => [
        index + 1,
        sanitize(reading.hora),
        reading.oxigenio,
        reading.inflamaveis_lel,
        reading.co,
        reading.h2s,
        sanitize(reading.instrumento),
        sanitize(reading.responsavel),
      ]),
      semanticRules: false,
      overrides: {
        styles: { fontSize: 7.4, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 8 } },
      },
    });
  }

  const evidencePhotos = pt.fotos_evidencia ?? [];
  if (evidencePhotos.length) {
    await drawEvidenceGallery(ctx, {
      title: "Evidências fotográficas da área",
      items: evidencePhotos.map((photo) => ({
        title: PT_EVIDENCE_FASE_LABELS[photo.fase] ?? photo.fase,
        description: photo.legenda,
        meta: photo.uploaded_at ? formatDateTime(photo.uploaded_at) : undefined,
      })),
      resolveImageDataUrl: options?.resolveEvidencePhotoDataUrl
        ? (_item, index) => options.resolveEvidencePhotoDataUrl!(index)
        : undefined,
    });
  }

  if (pt.status === "Encerrada") {
    drawMetadataGrid(ctx, {
      title: "Encerramento e devolução da área",
      columns: 2,
      fields: [
        { label: "Encerrado por", value: pt.encerrado_por?.nome },
        {
          label: "Término real",
          value: pt.data_hora_real_fim
            ? formatDateTime(pt.data_hora_real_fim)
            : undefined,
        },
        {
          label: "Condição da área",
          value: pt.condicao_area_encerramento,
        },
      ],
    });
    if (pt.observacoes_encerramento) {
      drawNarrativeSection(ctx, {
        title: "Observações de encerramento",
        content: pt.observacoes_encerramento,
      });
    }
  }

  await drawGovernanceClosingBlock(ctx, {
    signatures: signatures.map((signature) => ({
      label: resolveSignatureTypeLabel(signature.type),
      name: resolveSignatureSignerName(signature),
      role: resolveSignatureSignerRole(signature),
      date: formatDate(signature.signed_at || signature.created_at),
      image: signature.signature_data ?? null,
    })),
    code,
    url: validationUrl,
    title: "Governança, autenticidade e autorização",
    subtitle:
      "Documento válido para auditoria por QR code e identificador público.",
  });
}
