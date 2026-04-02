import type { ChecklistItem, ChecklistTopic } from "@/services/checklistsService";
import {
  deriveChecklistAggregateStatusFromSubitems,
  normalizeChecklistStatusForResponseType,
} from "./checklist-status";

export type BarrierControlStatus =
  | "rompido"
  | "degradado"
  | "pendente"
  | "integro";

export type ChecklistBarrierSummary = {
  status_barreira: "integra" | "degradada" | "rompida";
  controles_rompidos: number;
  controles_degradados: number;
  controles_pendentes: number;
  bloqueia_operacao: boolean;
};

const isNegativeStatus = (status: ChecklistItem["status"] | undefined) =>
  status === "nok" ||
  status === "nao" ||
  status === false ||
  status === "Não Conforme";

const isPendingStatus = (status: ChecklistItem["status"] | undefined) =>
  status === undefined ||
  status === null ||
  status === "Pendente";

export const getChecklistItemEffectiveStatus = (
  item: ChecklistItem,
): Exclude<ChecklistItem["status"], boolean> => {
  const supportsSubitemAggregation =
    item.tipo_resposta === "sim_nao" ||
    item.tipo_resposta === "sim_nao_na" ||
    item.tipo_resposta === "conforme";

  if (supportsSubitemAggregation && (item.subitens || []).length > 0) {
    return deriveChecklistAggregateStatusFromSubitems(
      item.subitens,
      item.tipo_resposta,
    );
  }

  return normalizeChecklistStatusForResponseType(item.status, item.tipo_resposta);
};

export const classifyChecklistItemControlStatus = (
  item: ChecklistItem,
): BarrierControlStatus => {
  const effectiveStatus = getChecklistItemEffectiveStatus(item);

  if (isPendingStatus(effectiveStatus)) {
    return "pendente";
  }

  if (!isNegativeStatus(effectiveStatus)) {
    return "integro";
  }

  if (item.bloqueia_operacao_quando_nc || item.criticidade === "critico") {
    return "rompido";
  }

  return "degradado";
};

export const hasChecklistItemNegativeAssessment = (item: ChecklistItem) => {
  const classification = classifyChecklistItemControlStatus(item);
  return classification === "rompido" || classification === "degradado";
};

export const computeChecklistBarrierSummary = (
  topic: Pick<
    ChecklistTopic,
    "limite_ruptura" | "status_barreira" | "controles_rompidos" | "controles_degradados" | "controles_pendentes" | "bloqueia_operacao"
  >,
  items: ChecklistItem[],
): ChecklistBarrierSummary => {
  const limiteRuptura =
    typeof topic.limite_ruptura === "number" && topic.limite_ruptura > 0
      ? topic.limite_ruptura
      : 1;

  const classifications = items.map(classifyChecklistItemControlStatus);
  const controlesRompidos = classifications.filter(
    (status) => status === "rompido",
  ).length;
  const controlesDegradados = classifications.filter(
    (status) => status === "degradado",
  ).length;
  const controlesPendentes = classifications.filter(
    (status) => status === "pendente",
  ).length;
  const bloqueiaOperacaoPorItem = items.some(
    (item) =>
      item.bloqueia_operacao_quando_nc &&
      classifyChecklistItemControlStatus(item) === "rompido",
  );
  const statusBarreira =
    controlesRompidos >= limiteRuptura || bloqueiaOperacaoPorItem
      ? "rompida"
      : controlesDegradados > 0 || controlesPendentes > 0
        ? "degradada"
        : "integra";

  return {
    status_barreira: statusBarreira,
    controles_rompidos: controlesRompidos,
    controles_degradados: controlesDegradados,
    controles_pendentes: controlesPendentes,
    bloqueia_operacao: statusBarreira === "rompida" || bloqueiaOperacaoPorItem,
  };
};
