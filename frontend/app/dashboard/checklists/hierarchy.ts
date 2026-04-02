import type {
  ChecklistItem,
  ChecklistSubitem,
} from "@/services/checklistsService";

const DEFAULT_TOPIC_TITLE = "Estrutura principal";

const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const createChecklistTopicId = () => createId("topico");
export const createChecklistItemId = () => createId("item");
export const createChecklistSubitemId = () => createId("subitem");

export const toAlphabeticalLabel = (index: number): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let current = Math.max(index, 0);
  let label = "";

  do {
    label = alphabet[current % 26] + label;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return `${label})`;
};

const normalizeSubitems = (subitems?: ChecklistSubitem[]): ChecklistSubitem[] => {
  if (!Array.isArray(subitems)) {
    return [];
  }

  const normalized: ChecklistSubitem[] = [];
  subitems.forEach((subitem, index) => {
    const texto = typeof subitem?.texto === "string" ? subitem.texto.trim() : "";
    if (!texto) {
      return;
    }
    normalized.push({
      id: subitem.id || createChecklistSubitemId(),
      texto,
      ordem: index + 1,
    });
  });

  return normalized;
};

export type ChecklistTopicInput = {
  id?: string;
  titulo: string;
  ordem?: number;
  itens?: ChecklistItem[];
};

export type NormalizedChecklistTopic = {
  id: string;
  titulo: string;
  ordem: number;
  itens: ChecklistItem[];
};

export type NormalizedChecklistHierarchy = {
  topicos: NormalizedChecklistTopic[];
  itens: ChecklistItem[];
};

const deriveTopicsFromItems = (items: ChecklistItem[]): NormalizedChecklistTopic[] => {
  const map = new Map<string, NormalizedChecklistTopic>();
  let fallbackIndex = 1;

  items.forEach((item) => {
    const topicoId = item.topico_id?.trim() || `legacy-${fallbackIndex++}`;
    const topicoTitulo =
      item.topico_titulo?.trim() || item.topico_id?.trim() || DEFAULT_TOPIC_TITLE;

    if (!map.has(topicoId)) {
      map.set(topicoId, {
        id: topicoId,
        titulo: topicoTitulo,
        ordem: typeof item.ordem_topico === "number" ? item.ordem_topico : map.size + 1,
        itens: [],
      });
    }
  });

  if (!map.size) {
    const fallbackId = createChecklistTopicId();
    map.set(fallbackId, {
      id: fallbackId,
      titulo: DEFAULT_TOPIC_TITLE,
      ordem: 1,
      itens: [],
    });
  }

  return Array.from(map.values()).sort(
    (left, right) => (left.ordem || 0) - (right.ordem || 0),
  );
};

export const normalizeChecklistHierarchy = (input: {
  topicos?: ChecklistTopicInput[];
  itens?: ChecklistItem[];
}): NormalizedChecklistHierarchy => {
  const sourceTopics = Array.isArray(input.topicos) ? input.topicos : [];
  const rawItems = Array.isArray(input.itens) ? input.itens : [];
  const nestedTopicItems =
    rawItems.length > 0
      ? []
      : sourceTopics.flatMap((topico, topicoIndex) => {
          if (!Array.isArray(topico?.itens)) {
            return [];
          }

          const topicId = topico.id || createChecklistTopicId();
          const topicTitle =
            typeof topico.titulo === "string" && topico.titulo.trim()
              ? topico.titulo.trim()
              : DEFAULT_TOPIC_TITLE;

          return topico.itens.map((item, itemIndex) => ({
            ...item,
            topico_id: item.topico_id || topicId,
            topico_titulo: item.topico_titulo || topicTitle,
            ordem_topico: item.ordem_topico ?? topico.ordem ?? topicoIndex + 1,
            ordem_item: item.ordem_item ?? itemIndex + 1,
          }));
        });
  const effectiveItems = rawItems.length > 0 ? rawItems : nestedTopicItems;

  let normalizedTopics: NormalizedChecklistTopic[];
  if (sourceTopics.length > 0) {
    const mapped: NormalizedChecklistTopic[] = [];
    sourceTopics.forEach((topico, index) => {
      const titulo =
        typeof topico?.titulo === "string" ? topico.titulo.trim() : "";
      if (!titulo) {
        return;
      }
      mapped.push({
        id: topico.id || createChecklistTopicId(),
        titulo,
        ordem: index + 1,
        itens: [],
      });
    });
    normalizedTopics =
      mapped.length > 0 ? mapped : deriveTopicsFromItems(effectiveItems);
  } else {
    normalizedTopics = deriveTopicsFromItems(effectiveItems);
  }

  const topicById = new Map(
    normalizedTopics.map((topico) => [topico.id as string, topico]),
  );

  const itemsByTopic = new Map<string, ChecklistItem[]>();
  normalizedTopics.forEach((topico) => {
    itemsByTopic.set(topico.id as string, []);
  });

  effectiveItems.forEach((rawItem) => {
    const itemText = typeof rawItem?.item === "string" ? rawItem.item.trim() : "";
    if (!itemText) {
      return;
    }

    const fallbackTopic = normalizedTopics[0];
    const desiredTopicId = rawItem.topico_id?.trim() || (fallbackTopic?.id as string);
    const topic = topicById.get(desiredTopicId) || fallbackTopic;
    if (!topic || !topic.id) {
      return;
    }

    const existingItems = itemsByTopic.get(topic.id) || [];
    const nextItem: ChecklistItem = {
      ...rawItem,
      id: rawItem.id || createChecklistItemId(),
      item: itemText,
      topico_id: topic.id,
      topico_titulo: topic.titulo,
      ordem_topico: topic.ordem,
      ordem_item: existingItems.length + 1,
      subitens: normalizeSubitems(rawItem.subitens),
      fotos: Array.isArray(rawItem.fotos) ? rawItem.fotos : [],
      tipo_resposta: rawItem.tipo_resposta || "sim_nao_na",
      obrigatorio: rawItem.obrigatorio ?? true,
      peso: typeof rawItem.peso === "number" ? rawItem.peso : 1,
      status: rawItem.status ?? "sim",
      observacao:
        typeof rawItem.observacao === "string" ? rawItem.observacao : "",
    };
    existingItems.push(nextItem);
    itemsByTopic.set(topic.id, existingItems);
  });

  const flatItems = normalizedTopics.flatMap((topico) =>
    (itemsByTopic.get(topico.id as string) || []).map((item, index) => ({
      ...item,
      topico_id: topico.id as string,
      topico_titulo: topico.titulo,
      ordem_topico: topico.ordem,
      ordem_item: index + 1,
      subitens: normalizeSubitems(item.subitens),
    })),
  );

  return {
    topicos: normalizedTopics.map((topico) => ({
      ...topico,
      itens: flatItems.filter((item) => item.topico_id === topico.id),
    })),
    itens: flatItems,
  };
};
