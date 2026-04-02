import type {
  ChecklistItem,
  ChecklistSubitem,
} from "@/services/checklistsService";

type ChecklistResponseType = ChecklistItem["tipo_resposta"];
type ChecklistStatus = ChecklistItem["status"];

const isNegativeStatus = (status: ChecklistStatus | undefined) =>
  status === "nok" ||
  status === "nao" ||
  status === false ||
  status === "Não Conforme";

const isNotApplicableStatus = (status: ChecklistStatus | undefined) =>
  status === "na";

const isPendingStatus = (status: ChecklistStatus | undefined) =>
  status === undefined ||
  status === null ||
  status === "Pendente";

export const getDefaultChecklistStatusForResponseType = (
  tipoResposta?: ChecklistResponseType,
): Exclude<ChecklistStatus, boolean> => {
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

export const normalizeChecklistStatusForResponseType = (
  status: ChecklistStatus | undefined,
  tipoResposta?: ChecklistResponseType,
): Exclude<ChecklistStatus, boolean> => {
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
      return getDefaultChecklistStatusForResponseType(tipoResposta);
  }
};

export const deriveChecklistAggregateStatusFromSubitems = (
  subitems: ChecklistSubitem[] | undefined,
  tipoResposta?: ChecklistResponseType,
): Exclude<ChecklistStatus, boolean> => {
  const selectableSubitems = Array.isArray(subitems)
    ? subitems
        .map((subitem) =>
          normalizeChecklistStatusForResponseType(subitem?.status, tipoResposta),
        )
        .filter((status) => !isPendingStatus(status))
    : [];

  if (!selectableSubitems.length) {
    return getDefaultChecklistStatusForResponseType(tipoResposta);
  }

  if (selectableSubitems.some((status) => isNegativeStatus(status))) {
    return tipoResposta === "sim_nao" || tipoResposta === "sim_nao_na"
      ? "nao"
      : "nok";
  }

  const allNotApplicable = selectableSubitems.every((status) =>
    isNotApplicableStatus(status),
  );
  if (allNotApplicable) {
    return "na";
  }

  return tipoResposta === "conforme" ? "ok" : "sim";
};

export const getChecklistStatusLabel = (
  status: ChecklistStatus | undefined,
  tipoResposta?: ChecklistResponseType,
) => {
  const normalized = normalizeChecklistStatusForResponseType(status, tipoResposta);
  switch (normalized) {
    case "ok":
      return "Conforme";
    case "nok":
      return "NC";
    case "na":
      return "N/A";
    case "nao":
      return "Não";
    case "sim":
      return "Sim";
    case "Pendente":
      return "Pendente";
    default:
      return normalized;
  }
};
