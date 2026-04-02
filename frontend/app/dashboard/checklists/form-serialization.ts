import type {
  Checklist,
  ChecklistItem,
  ChecklistSubitem,
} from "@/services/checklistsService";
import {
  createChecklistItemId,
  createChecklistSubitemId,
  createChecklistTopicId,
  normalizeChecklistHierarchy,
} from "./hierarchy";
import type { ChecklistFormData } from "./types";

type ChecklistFormItem = ChecklistFormData["itens"][number];
type ChecklistFormTopic = ChecklistFormData["topicos"][number];

const getDefaultChecklistItemStatus = (
  tipoResposta?: ChecklistItem["tipo_resposta"],
): ChecklistFormItem["status"] => {
  switch (tipoResposta) {
    case "conforme":
      return "ok";
    case "texto":
    case "foto":
      return "Pendente";
    case "sim_nao":
    case "sim_nao_na":
    default:
      return "sim";
  }
};

const normalizeChecklistItemStatus = (
  status: ChecklistItem["status"] | ChecklistSubitem["status"] | undefined,
  tipoResposta?: ChecklistItem["tipo_resposta"],
): ChecklistFormItem["status"] => {
  if (status === true) {
    return tipoResposta === "sim_nao" || tipoResposta === "sim_nao_na"
      ? "sim"
      : "ok";
  }

  if (status === false) {
    return tipoResposta === "sim_nao" || tipoResposta === "sim_nao_na"
      ? "nao"
      : "nok";
  }

  switch (status) {
    case "Conforme":
      return "ok";
    case "Não Conforme":
      return tipoResposta === "sim_nao" || tipoResposta === "sim_nao_na"
        ? "nao"
        : "nok";
    case "ok":
    case "nok":
    case "na":
    case "sim":
    case "nao":
    case "Pendente":
      return status;
    default:
      return getDefaultChecklistItemStatus(tipoResposta);
  }
};

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
  });

  const serializedTopics: ChecklistFormTopic[] = normalizedHierarchy.topicos.map(
    (topico, index) => ({
      id: topico.id || createChecklistTopicId(),
      titulo: topico.titulo,
      ordem: index + 1,
    }),
  );

  const serializedItems: ChecklistFormData["itens"] =
    normalizedHierarchy.itens.map((item) => {
      const tipoResposta = item.tipo_resposta || "sim_nao_na";
      return {
        item: item.item || "",
        status: options?.resetExecutionState
          ? getDefaultChecklistItemStatus(tipoResposta)
          : normalizeChecklistItemStatus(item.status, tipoResposta),
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
        ordem_topico: item.ordem_topico,
        ordem_item: item.ordem_item,
        subitens: (item.subitens || []).map((subitem, index) => ({
          id: subitem.id || createChecklistSubitemId(),
          texto: subitem.texto,
          ordem: subitem.ordem ?? index + 1,
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
    isTemplateMode: boolean;
  },
) => {
  const normalizedHierarchy = normalizeChecklistHierarchy({
    topicos: data.topicos || [],
    itens: data.itens || [],
  });

  const serializedItems = normalizedHierarchy.itens.map((item) => ({
    ...item,
    id: item.id || createChecklistItemId(),
    subitens: (item.subitens || []).map((subitem, index) => ({
      id: subitem.id || createChecklistSubitemId(),
      texto: subitem.texto,
      ordem: index + 1,
    })),
  }));

  const itemsByTopic = new Map<string, typeof serializedItems>();
  serializedItems.forEach((item) => {
    const key = item.topico_id || "";
    const current = itemsByTopic.get(key) || [];
    current.push(item);
    itemsByTopic.set(key, current);
  });

  const serializedTopics = normalizedHierarchy.topicos.map((topico, index) => ({
    id: topico.id || createChecklistTopicId(),
    titulo: topico.titulo,
    ordem: index + 1,
    itens: itemsByTopic.get(topico.id || "") || [],
  }));

  return {
    ...data,
    equipamento:
      options.checklistMode === "tool" ? data.equipamento?.trim() || "" : "",
    maquina:
      options.checklistMode === "machine" ? data.maquina?.trim() || "" : "",
    is_modelo: options.isTemplateMode ? true : data.is_modelo,
    topicos: serializedTopics,
    itens: serializedItems,
  };
};
