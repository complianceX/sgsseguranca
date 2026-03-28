import { Apr } from "@/services/aprsService";

export type AprListingRecord = Apr & {
  offlineQueued?: boolean;
  offlineQueueItemId?: string;
  offlineQueueDeduplicated?: boolean;
};

export type AprListingDensity = "comfortable" | "compact";
export type AprDueFilter =
  | ""
  | "expired"
  | "today"
  | "next-7-days"
  | "upcoming"
  | "no-deadline";
export type AprSortOption =
  | "priority"
  | "updated-desc"
  | "deadline-asc"
  | "title-asc";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type StatusMeta = {
  label: string;
  tone: Tone;
};

type DeadlineMeta = {
  absoluteLabel: string;
  relativeLabel: string;
  tone: Tone;
  daysUntil: number | null;
  hasDeadline: boolean;
};

type BlockingMeta = {
  label: string;
  tone: Tone;
};

type ResponsibleMeta = {
  name: string;
  role: string;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDayDifference(target: Date, base: Date) {
  const targetStart = startOfDay(target).getTime();
  const baseStart = startOfDay(base).getTime();
  return Math.round((targetStart - baseStart) / 86400000);
}

export function formatAprDate(value?: string | null) {
  if (!value) return "Sem data";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Data inválida";
  }

  return parsed.toLocaleDateString("pt-BR");
}

export function formatAprDateTime(value?: string | null) {
  if (!value) return "Sem atualização";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Data inválida";
  }

  const now = new Date();
  const diff = getDayDifference(parsed, now);

  if (diff === 0) {
    return `Hoje, ${parsed.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  if (diff === -1) {
    return `Ontem, ${parsed.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getAprStatusMeta(apr: AprListingRecord): StatusMeta {
  if (apr.offlineQueued) {
    return { label: "Offline pendente", tone: "info" };
  }

  switch (apr.status) {
    case "Aprovada":
      return { label: "Aprovada", tone: "success" };
    case "Pendente":
      return { label: "Pendente", tone: "warning" };
    case "Cancelada":
      return { label: "Cancelada", tone: "danger" };
    case "Encerrada":
      return { label: "Encerrada", tone: "neutral" };
    default:
      return { label: apr.status || "Sem status", tone: "neutral" };
  }
}

export function getAprResponsibleMeta(apr: AprListingRecord): ResponsibleMeta {
  if ((apr.status === "Aprovada" || apr.status === "Encerrada") && apr.aprovado_por?.nome) {
    return { name: apr.aprovado_por.nome, role: "Aprovador" };
  }

  if (apr.auditado_por?.nome) {
    return { name: apr.auditado_por.nome, role: "Auditor" };
  }

  if (apr.elaborador?.nome) {
    return { name: apr.elaborador.nome, role: "Elaborador" };
  }

  if (apr.participants?.[0]?.nome) {
    return { name: apr.participants[0].nome, role: "Participante" };
  }

  return { name: "Não definido", role: "Sem responsável" };
}

export function getAprDeadlineMeta(
  apr: AprListingRecord,
  now = new Date(),
): DeadlineMeta {
  if (!apr.data_fim) {
    return {
      absoluteLabel: "Sem prazo",
      relativeLabel: "Prazo não definido",
      tone: "neutral",
      daysUntil: null,
      hasDeadline: false,
    };
  }

  const parsed = new Date(apr.data_fim);
  if (Number.isNaN(parsed.getTime())) {
    return {
      absoluteLabel: "Data inválida",
      relativeLabel: "Corrigir prazo",
      tone: "danger",
      daysUntil: null,
      hasDeadline: false,
    };
  }

  const daysUntil = getDayDifference(parsed, now);

  if (daysUntil < 0) {
    const absoluteDays = Math.abs(daysUntil);
    return {
      absoluteLabel: parsed.toLocaleDateString("pt-BR"),
      relativeLabel: `Atrasada ${absoluteDays} ${absoluteDays === 1 ? "dia" : "dias"}`,
      tone: "danger",
      daysUntil,
      hasDeadline: true,
    };
  }

  if (daysUntil === 0) {
    return {
      absoluteLabel: parsed.toLocaleDateString("pt-BR"),
      relativeLabel: "Vence hoje",
      tone: "warning",
      daysUntil,
      hasDeadline: true,
    };
  }

  if (daysUntil <= 7) {
    return {
      absoluteLabel: parsed.toLocaleDateString("pt-BR"),
      relativeLabel: `Vence em ${daysUntil} ${daysUntil === 1 ? "dia" : "dias"}`,
      tone: "warning",
      daysUntil,
      hasDeadline: true,
    };
  }

  return {
    absoluteLabel: parsed.toLocaleDateString("pt-BR"),
    relativeLabel: `Vence em ${daysUntil} dias`,
    tone: "neutral",
    daysUntil,
    hasDeadline: true,
  };
}

export function getAprBlockingMeta(apr: AprListingRecord): BlockingMeta {
  if (apr.offlineQueued) {
    return {
      label: "Sincronização pendente",
      tone: "danger",
    };
  }

  if (apr.status === "Pendente") {
    return {
      label: "Aguardando aprovação",
      tone: "warning",
    };
  }

  if (apr.status === "Aprovada" && !apr.pdf_file_key) {
    return {
      label: "PDF final não emitido",
      tone: "warning",
    };
  }

  if (apr.status === "Aprovada" && apr.pdf_file_key) {
    return {
      label: "Pronta para encerramento",
      tone: "info",
    };
  }

  if (apr.status === "Cancelada") {
    return {
      label: "APR reprovada",
      tone: "danger",
    };
  }

  if (apr.status === "Encerrada") {
    return {
      label: "Fluxo concluído",
      tone: "success",
    };
  }

  return {
    label: "Sem bloqueios",
    tone: "neutral",
  };
}

export function matchesAprDueFilter(
  apr: AprListingRecord,
  filter: AprDueFilter,
  now = new Date(),
) {
  if (!filter) return true;

  const deadline = getAprDeadlineMeta(apr, now);

  switch (filter) {
    case "expired":
      return deadline.daysUntil !== null && deadline.daysUntil < 0;
    case "today":
      return deadline.daysUntil === 0;
    case "next-7-days":
      return deadline.daysUntil !== null && deadline.daysUntil >= 0 && deadline.daysUntil <= 7;
    case "upcoming":
      return deadline.daysUntil !== null && deadline.daysUntil > 7;
    case "no-deadline":
      return !deadline.hasDeadline;
    default:
      return true;
  }
}

export function getAprPriorityScore(apr: AprListingRecord) {
  const status = getAprStatusMeta(apr);
  const deadline = getAprDeadlineMeta(apr);
  const blocking = getAprBlockingMeta(apr);

  let score = 0;

  if (blocking.tone === "danger") score += 60;
  if (blocking.tone === "warning") score += 35;
  if (status.tone === "warning") score += 15;
  if (status.tone === "info") score += 20;
  if (deadline.tone === "danger") score += 50;
  if (deadline.tone === "warning") score += 30;

  if (deadline.daysUntil !== null) {
    score -= Math.min(Math.max(deadline.daysUntil, -30), 30);
  }

  return score;
}

export function compareAprs(
  left: AprListingRecord,
  right: AprListingRecord,
  sort: AprSortOption,
) {
  if (sort === "priority") {
    return getAprPriorityScore(right) - getAprPriorityScore(left);
  }

  if (sort === "updated-desc") {
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  }

  if (sort === "deadline-asc") {
    const leftDeadline = getAprDeadlineMeta(left).daysUntil ?? Number.POSITIVE_INFINITY;
    const rightDeadline = getAprDeadlineMeta(right).daysUntil ?? Number.POSITIVE_INFINITY;
    return leftDeadline - rightDeadline;
  }

  return left.titulo.localeCompare(right.titulo, "pt-BR");
}

export function getToneClasses(tone: Tone) {
  switch (tone) {
    case "success":
      return {
        badge:
          "border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]",
        text: "text-[var(--ds-color-success)]",
        inline:
          "border-[color:var(--ds-color-success)]/18 bg-[color:var(--ds-color-success)]/8 text-[var(--ds-color-success)]",
      };
    case "warning":
      return {
        badge:
          "border-[color:var(--ds-color-warning)]/20 bg-[color:var(--ds-color-warning)]/14 text-[var(--ds-color-warning)]",
        text: "text-[var(--ds-color-warning)]",
        inline:
          "border-[color:var(--ds-color-warning)]/18 bg-[color:var(--ds-color-warning)]/8 text-[var(--ds-color-warning)]",
      };
    case "danger":
      return {
        badge:
          "border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]",
        text: "text-[var(--ds-color-danger)]",
        inline:
          "border-[color:var(--ds-color-danger)]/18 bg-[color:var(--ds-color-danger)]/8 text-[var(--ds-color-danger)]",
      };
    case "info":
      return {
        badge:
          "border-[color:var(--ds-color-info)]/20 bg-[color:var(--ds-color-info)]/12 text-[var(--ds-color-info)]",
        text: "text-[var(--ds-color-info)]",
        inline:
          "border-[color:var(--ds-color-info)]/18 bg-[color:var(--ds-color-info)]/8 text-[var(--ds-color-info)]",
      };
    default:
      return {
        badge:
          "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
        text: "text-[var(--ds-color-text-secondary)]",
        inline:
          "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/70 text-[var(--ds-color-text-secondary)]",
      };
  }
}
