import type {
  Checklist,
} from "@/services/checklistsService";
import {
  deriveChecklistAggregateStatusFromSubitems,
  getDefaultChecklistStatusForResponseType,
  normalizeChecklistStatusForResponseType,
} from "./checklist-status";
import {
  createChecklistItemId,
  createChecklistSubitemId,
  createChecklistTopicId,
  normalizeChecklistHierarchy,
} from "./hierarchy";
import type { ChecklistFormData } from "./types";

type ChecklistFormTopic = ChecklistFormData["topicos"][number];

export const buildChecklistFormHierarchy = (
  topicos: Checklist["topicos"] | undefined,
  itens: Checklist["itens"] | undefined,
  options?: {
    resetExecutionState?: boolean;
  },
): Pick<ChecklistFormData, "topicos" | "itens"> => {
  const normalizedHierarchy = normalizeChecklistHierarchy({
    topicos,
    itens,
  }, {
    preserveEmptyItems: true,
    preserveEmptySubitems: true,
  });

  const serializedTopics: ChecklistFormTopic[] = normalizedHierarchy.topicos.map(
    (topico, index) => ({
      id: topico.id || createChecklistTopicId(),
      titulo: topico.titulo,
      descricao: topico.descricao || "",
      ordem: index + 1,
      barreira_tipo: topico.barreira_tipo,
      peso_barreira: topico.peso_barreira,
      limite_ruptura: topico.limite_ruptura,
      status_barreira: topico.status_barreira,
      controles_rompidos: topico.controles_rompidos,
      controles_degradados: topico.controles_degradados,
      controles_pendentes: topico.controles_pendentes,
      bloqueia_operacao: topico.bloqueia_operacao,
    }),
  );

  const serializedItems: ChecklistFormData["itens"] =
    normalizedHierarchy.itens.map((item) => {
      const tipoResposta = item.tipo_resposta || "sim_nao_na";
      const normalizedItemStatus = options?.resetExecutionState
        ? getDefaultChecklistStatusForResponseType(tipoResposta)
        : normalizeChecklistStatusForResponseType(item.status, tipoResposta);
      const hasExplicitSubitemStatuses = (item.subitens || []).some(
        (subitem) => subitem.status !== undefined,
      );

      return {
        item: item.item || "",
        status: normalizedItemStatus,
        tipo_resposta: tipoResposta,
        obrigatorio: item.obrigatorio ?? true,
        peso: item.peso ?? 1,
        resposta: options?.resetExecutionState ? "" : item.resposta,
        observacao: options?.resetExecutionState ? "" : item.observacao || "",
        fotos: options?.resetExecutionState ? [] : item.fotos || [],
        id: item.id || createChecklistItemId(),
        topico_id: item.topico_id || serializedTopics[0]?.id || "",
        topico_titulo:
          item.topico_titulo || serializedTopics[0]?.titulo || "",
        topico_descricao:
          item.topico_descricao || serializedTopics[0]?.descricao || "",
        ordem_topico: item.ordem_topico,
        ordem_item: item.ordem_item,
        barreira_tipo: item.barreira_tipo,
        peso_barreira: item.peso_barreira,
        limite_ruptura: item.limite_ruptura,
        criticidade: item.criticidade,
        bloqueia_operacao_quando_nc: item.bloqueia_operacao_quando_nc,
        exige_foto_quando_nc: item.exige_foto_quando_nc,
        exige_observacao_quando_nc: item.exige_observacao_quando_nc,
        acao_corretiva_imediata: item.acao_corretiva_imediata || "",
        subitens: (item.subitens || []).map((subitem, index) => ({
          id: subitem.id || createChecklistSubitemId(),
          texto: subitem.texto,
          ordem: subitem.ordem ?? index + 1,
          status: options?.resetExecutionState
            ? getDefaultChecklistStatusForResponseType(tipoResposta)
            : hasExplicitSubitemStatuses
              ? normalizeChecklistStatusForResponseType(
                  subitem.status,
                  tipoResposta,
                )
              : normalizedItemStatus,
          resposta: options?.resetExecutionState ? "" : subitem.resposta,
          observacao: options?.resetExecutionState
            ? ""
            : subitem.observacao || "",
        })),
      };
    });

  return {
    topicos: serializedTopics,
    itens: serializedItems,
  };
};

export const getChecklistTopicsWithoutItems = (
  topicos: ChecklistFormData["topicos"],
  itens: ChecklistFormData["itens"],
) => {
  const normalized = normalizeChecklistHierarchy({ topicos, itens });
  const itemCountByTopic = new Map<string, number>();

  normalized.itens.forEach((item) => {
    if (!item.topico_id) {
      return;
    }
    itemCountByTopic.set(
      item.topico_id,
      (itemCountByTopic.get(item.topico_id) || 0) + 1,
    );
  });

  return normalized.topicos.filter(
    (topico) => !topico.id || !itemCountByTopic.get(topico.id),
  );
};

export const buildChecklistRequestPayload = (
  data: ChecklistFormData,
  options: {
    checklistMode: "tool" | "machine";
    structureMode: "machines_equipment" | "operational";
    isTemplateMode: boolean;
  },
) => {
  const normalizedHierarchy = normalizeChecklistHierarchy({
    topicos: data.topicos || [],
    itens: data.itens || [],
  });

  const serializedItems = normalizedHierarchy.itens.map((item) => {
    const serialized = {
      ...item,
      id: item.id || createChecklistItemId(),
      status:
        item.subitens?.length &&
        (item.tipo_resposta === "sim_nao" ||
          item.tipo_resposta === "sim_nao_na" ||
          item.tipo_resposta === "conforme")
          ? deriveChecklistAggregateStatusFromSubitems(
              item.subitens,
              item.tipo_resposta,
            )
          : normalizeChecklistStatusForResponseType(
              item.status,
              item.tipo_resposta,
            ),
      subitens: (item.subitens || []).map((subitem, index) => ({
        id: subitem.id || createChecklistSubitemId(),
        texto: subitem.texto,
        ordem: index + 1,
        status: normalizeChecklistStatusForResponseType(
          subitem.status,
          item.tipo_resposta,
        ),
        resposta: subitem.resposta,
        observacao: subitem.observacao || "",
      })),
    };

    if (options.structureMode === "operational") {
      return {
        ...serialized,
        criticidade: undefined,
        bloqueia_operacao_quando_nc: false,
        exige_foto_quando_nc: false,
        exige_observacao_quando_nc: false,
        acao_corretiva_imediata: "",
        barreira_tipo: undefined,
        peso_barreira: undefined,
        limite_ruptura: undefined,
      };
    }

    return serialized;
  });

  const itemsByTopic = new Map<string, typeof serializedItems>();
  serializedItems.forEach((item) => {
    const key = item.topico_id || "";
    const current = itemsByTopic.get(key) || [];
    current.push(item);
    itemsByTopic.set(key, current);
  });

  const serializedTopics = normalizedHierarchy.topicos.map((topico, index) => {
    const serialized = {
      id: topico.id || createChecklistTopicId(),
      titulo: topico.titulo,
      descricao: topico.descricao || "",
      ordem: index + 1,
      barreira_tipo: topico.barreira_tipo,
      peso_barreira: topico.peso_barreira,
      limite_ruptura: topico.limite_ruptura,
      status_barreira: topico.status_barreira,
      controles_rompidos: topico.controles_rompidos,
      controles_degradados: topico.controles_degradados,
      controles_pendentes: topico.controles_pendentes,
      bloqueia_operacao: topico.bloqueia_operacao,
      itens: itemsByTopic.get(topico.id || "") || [],
    };

    if (options.structureMode === "operational") {
      return {
        ...serialized,
        descricao: "",
        barreira_tipo: undefined,
        peso_barreira: undefined,
        limite_ruptura: undefined,
        status_barreira: undefined,
        controles_rompidos: undefined,
        controles_degradados: undefined,
        controles_pendentes: undefined,
        bloqueia_operacao: undefined,
      };
    }

    return serialized;
  });

  return {
    ...data,
    // company_id não deve ir no body: o backend deriva do contexto do tenant (JWT/header).
    // O DTO rejeita qualquer valor não-vazio com @IsEmpty().
    company_id: undefined,
    equipamento:
      options.structureMode === "machines_equipment" &&
      options.checklistMode === "tool"
        ? data.equipamento?.trim() || ""
        : "",
    maquina:
      options.structureMode === "machines_equipment" &&
      options.checklistMode === "machine"
        ? data.maquina?.trim() || ""
        : "",
    foto_equipamento:
      options.structureMode === "machines_equipment"
        ? data.foto_equipamento || ""
        : "",
    is_modelo: options.isTemplateMode ? true : data.is_modelo,
    topicos: serializedTopics,
    itens: serializedItems,
  };
};
