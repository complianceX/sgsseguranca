"use client";

import React, { useCallback, useMemo } from "react";
import {
  useWatch,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AprFormData, AprRiskRowData } from "./aprForm.schema";
import { useAprCalculations } from "./useAprCalculations";

type RiskRowCompleteness = "complete" | "partial" | "empty";

type OperationalStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

function getPriorityShortLabel(priority?: string) {
  switch (priority) {
    case "Prioridade básica":
      return "Basica";
    case "Prioridade preferencial":
      return "Preferencial";
    case "Prioridade máxima":
      return "Maxima";
    default:
      return "Sem prioridade";
  }
}

function getRiskRowCompleteness(
  item: AprRiskRowData | undefined,
): RiskRowCompleteness {
  if (!item) return "empty";
  const hasIdentification = Boolean(
    item.atividade_processo || item.condicao_perigosa || item.agente_ambiental,
  );
  const hasEvaluation = Boolean(item.probabilidade && item.severidade);
  const hasControl = Boolean(item.medidas_prevencao);
  if (hasIdentification && hasEvaluation && hasControl) return "complete";
  if (hasIdentification || hasEvaluation) return "partial";
  return "empty";
}

function getToneClass(tone: OperationalStatusTone) {
  switch (tone) {
    case "success":
      return "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]";
    case "warning":
      return "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]";
    case "danger":
      return "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]";
    case "info":
      return "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]";
    default:
      return "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]";
  }
}

function getOperationalStatus({
  isCritical,
  isInconsistent,
  isReady,
  hasStarted,
  isIncomplete,
}: {
  isCritical: boolean;
  isInconsistent: boolean;
  isReady: boolean;
  hasStarted: boolean;
  isIncomplete: boolean;
}) {
  if (isCritical) {
    return {
      label: "Intervencao imediata",
      description: "Risco critico. O trabalho precisa de resposta imediata.",
      tone: "danger" as const,
    };
  }

  if (isInconsistent) {
    return {
      label: "Controle pendente",
      description: "Medidas preventivas precisam ser registradas antes da liberacao.",
      tone: "info" as const,
    };
  }

  if (isReady) {
    return {
      label: "Pronta para governanca",
      description: "Identificacao, matriz e medidas preenchidas.",
      tone: "success" as const,
    };
  }

  if (hasStarted && isIncomplete) {
    return {
      label: "Em avaliacao",
      description: "Defina probabilidade e severidade para concluir a matriz.",
      tone: "warning" as const,
    };
  }

  if (hasStarted) {
    return {
      label: "Em montagem",
      description: "Complete contexto, matriz e plano de acao.",
      tone: "neutral" as const,
    };
  }

  return {
    label: "Nao iniciada",
    description: "Preencha o risco para registrar a exposicao e a governanca.",
    tone: "neutral" as const,
  };
}

function getActionStatusPresentation(status?: string) {
  const normalized = String(status || "").trim().toLowerCase();

  if (!normalized) {
    return {
      label: "Sem status da acao",
      tone: "neutral" as const,
    };
  }

  if (
    normalized.includes("conclu") ||
    normalized.includes("finaliz") ||
    normalized.includes("encerr")
  ) {
    return { label: status || "Concluida", tone: "success" as const };
  }

  if (
    normalized.includes("bloque") ||
    normalized.includes("atras") ||
    normalized.includes("imped")
  ) {
    return { label: status || "Bloqueada", tone: "danger" as const };
  }

  if (normalized.includes("andamento") || normalized.includes("execu")) {
    return { label: status || "Em andamento", tone: "warning" as const };
  }

  if (
    normalized.includes("aberta") ||
    normalized.includes("pend") ||
    normalized.includes("aguard")
  ) {
    return { label: status || "Aberta", tone: "info" as const };
  }

  return {
    label: status || "Registrada",
    tone: "neutral" as const,
  };
}

function FieldShell({
  label,
  support,
  className,
  children,
}: {
  label: string;
  support?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
        {label}
      </label>
      {children}
      {support ? (
        <p className="mt-1.5 text-xs text-[var(--ds-color-text-secondary)]">
          {support}
        </p>
      ) : null}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          {eyebrow}
        </p>
        <h4 className="mt-1 text-sm font-bold text-[var(--ds-color-text-primary)]">
          {title}
        </h4>
        <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
          {description}
        </p>
      </div>
      {aside}
    </div>
  );
}

export const AprRiskRow = React.memo(function AprRiskRow({
  fieldId,
  index,
  totalRows,
  readOnly,
  compactMode,
  expanded,
  onToggleExpanded,
  onMove,
  onDuplicate,
  onRemove,
  control,
  register,
  setValue,
  aprFieldClass,
}: {
  fieldId: string;
  index: number;
  totalRows: number;
  readOnly: boolean;
  compactMode: boolean;
  expanded: boolean;
  onToggleExpanded: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number, fieldId: string) => void;
  control: Control<AprFormData>;
  register: UseFormRegister<AprFormData>;
  setValue: UseFormSetValue<AprFormData>;
  aprFieldClass: string;
}) {
  const { evaluateRisk, getCategoriaBadgeClass, getPrioridadeBadgeClass } =
    useAprCalculations();

  const item = useWatch({
    control,
    name: `itens_risco.${index}` as const,
  }) as AprRiskRowData | undefined;

  const probabilidade = String(item?.probabilidade || "");
  const severidade = String(item?.severidade || "");

  const calc = useMemo(
    () => evaluateRisk(probabilidade, severidade),
    [evaluateRisk, probabilidade, severidade],
  );

  const completeness = useMemo(() => getRiskRowCompleteness(item), [item]);

  const hasStarted = Boolean(
    item?.atividade_processo ||
      item?.agente_ambiental ||
      item?.condicao_perigosa ||
      item?.fontes_circunstancias ||
      item?.possiveis_lesoes ||
      item?.probabilidade ||
      item?.severidade ||
      item?.medidas_prevencao,
  );
  const isCritical = calc.categoria === "Crítico";
  const isSubstantial = calc.categoria === "Substancial";
  const isIncomplete = !probabilidade || !severidade;
  const missingMeasures = hasStarted && !String(item?.medidas_prevencao || "").trim();
  const isInconsistent = (isCritical || isSubstantial) && missingMeasures;
  const isPriorityHigh =
    calc.prioridade === "Prioridade preferencial" ||
    calc.prioridade === "Prioridade máxima";
  const isReady = completeness === "complete";
  const isRowExpanded = !compactMode || expanded;
  const compactHiddenGovernanceIncomplete =
    compactMode &&
    !isRowExpanded &&
    (!String(item?.medidas_prevencao || "").trim() ||
      !String(item?.responsavel || "").trim() ||
      !String(item?.prazo || "").trim() ||
      !String(item?.status_acao || "").trim());

  const operationalStatus = useMemo(
    () =>
      getOperationalStatus({
        isCritical,
        isInconsistent,
        isReady,
        hasStarted,
        isIncomplete,
      }),
    [hasStarted, isCritical, isInconsistent, isIncomplete, isReady],
  );

  const actionStatus = useMemo(
    () => getActionStatusPresentation(item?.status_acao),
    [item?.status_acao],
  );

  const shellClass = isCritical
    ? "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)]/60 shadow-[0_0_0_1px_var(--ds-color-danger-border)]"
    : isInconsistent
      ? "border-[var(--ds-color-info-border)] bg-[var(--ds-color-info-subtle)]/48"
      : isReady
        ? "border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)]/60"
        : hasStarted && isIncomplete
          ? "border-dashed border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)]/48"
          : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]";

  const compactFieldClass = cn(
    aprFieldClass,
    "min-h-[46px] px-3.5 py-2.5 text-[13px] leading-5 shadow-none",
  );
  const compactTextAreaClass = cn(
    compactFieldClass,
    "min-h-[164px] resize-y px-4 py-3 leading-6",
  );

  const focusNextGridField = useCallback((current: HTMLElement) => {
    const focusables = Array.from(
      document.querySelectorAll<HTMLElement>('[data-apr-nav="risk-grid"]'),
    ).filter((element) => {
      return (
        !element.hasAttribute("disabled") &&
        element.tabIndex !== -1 &&
        element.offsetParent !== null
      );
    });
    const currentIndex = focusables.indexOf(current);
    if (currentIndex >= 0) {
      focusables[currentIndex + 1]?.focus();
    }
  }, []);

  const handleAdvanceKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      event.preventDefault();
      focusNextGridField(event.currentTarget);
    },
    [focusNextGridField],
  );

  const handleProbabilityChange = useCallback(
    (value: string) => {
      if (readOnly) return;
      setValue(`itens_risco.${index}.probabilidade`, value, {
        shouldDirty: true,
        shouldValidate: true,
      });
      const next = evaluateRisk(value, String(item?.severidade || ""));
      setValue(`itens_risco.${index}.categoria_risco`, next.categoria, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [evaluateRisk, index, item?.severidade, readOnly, setValue],
  );

  const handleSeverityChange = useCallback(
    (value: string) => {
      if (readOnly) return;
      setValue(`itens_risco.${index}.severidade`, value, {
        shouldDirty: true,
        shouldValidate: true,
      });
      const next = evaluateRisk(String(item?.probabilidade || ""), value);
      setValue(`itens_risco.${index}.categoria_risco`, next.categoria, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [evaluateRisk, index, item?.probabilidade, readOnly, setValue],
  );

  const actionButtonClass =
    "inline-flex items-center justify-center rounded-[var(--ds-radius-md)] border p-2 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div
      key={fieldId}
      className={cn(
        "overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border shadow-[var(--ds-shadow-sm)] transition-all duration-200",
        shellClass,
      )}
    >
      <div className="grid gap-3 p-3 xl:grid-cols-[124px_minmax(0,1fr)]">
        <aside className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/92 p-3">
          <div className="mb-2 inline-flex items-center gap-1 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
            <GripVertical className="h-3.5 w-3.5" />
            Arraste
          </div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                Risco
              </p>
              <p className="mt-1 text-[30px] font-black leading-none text-[var(--ds-color-text-primary)]">
                {String(index + 1).padStart(2, "0")}
              </p>
            </div>
            {compactMode && (
              <button
                type="button"
                onClick={() => onToggleExpanded(index)}
                className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] p-1.5 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
                title={isRowExpanded ? "Recolher detalhes" : "Expandir detalhes"}
              >
                {isRowExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>

          <div
            className={cn(
              "mt-4 rounded-[var(--ds-radius-lg)] border px-3 py-2.5",
              getToneClass(operationalStatus.tone),
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Estado
            </p>
            <p className="mt-1 text-sm font-bold">{operationalStatus.label}</p>
            <p className="mt-1 text-xs leading-5 opacity-90">
              {operationalStatus.description}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {isCritical && (
              <span className="inline-flex rounded-full border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]">
                Critico
              </span>
            )}
            {isPriorityHigh && !isCritical && (
              <span className="inline-flex rounded-full border border-[var(--apr-priority-border)] bg-[var(--apr-priority-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--apr-priority-fg)]">
                Alta prioridade
              </span>
            )}
            {isInconsistent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--apr-incomplete-border)] bg-[var(--apr-incomplete-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--apr-incomplete-fg)]">
                <AlertTriangle className="h-3 w-3" />
                Sem medida
              </span>
            )}
            {isReady && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--apr-ready-border)] bg-[var(--apr-ready-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--apr-ready-fg)]">
                <CheckCircle2 className="h-3 w-3" />
                Pronta
              </span>
            )}
            {compactHiddenGovernanceIncomplete ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                <AlertTriangle className="h-3 w-3" />
                Dados incompletos
              </span>
            ) : null}
          </div>

          <div className="mt-4 border-t border-[var(--ds-color-border-subtle)] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
              Acoes
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onMove(index, index - 1)}
                disabled={readOnly || index === 0}
                className={cn(
                  actionButtonClass,
                  "border-[var(--ds-color-border-subtle)]",
                )}
                title="Mover para cima"
                aria-label="Mover linha para cima"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onMove(index, index + 1)}
                disabled={readOnly || index === totalRows - 1}
                className={cn(
                  actionButtonClass,
                  "border-[var(--ds-color-border-subtle)]",
                )}
                title="Mover para baixo"
                aria-label="Mover linha para baixo"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(index)}
                disabled={readOnly}
                className={cn(
                  actionButtonClass,
                  "border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] text-[var(--color-primary)] hover:bg-[color:var(--ds-color-primary-subtle)]/80 disabled:opacity-40",
                )}
                title="Duplicar linha"
                aria-label="Duplicar linha"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(index, fieldId)}
                disabled={readOnly}
                className={cn(
                  actionButtonClass,
                  "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)] hover:bg-[color:var(--ds-color-danger-subtle)]/80 disabled:opacity-40",
                )}
                title="Remover linha"
                aria-label="Remover linha"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(360px,0.88fr)]">
            <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/94 p-4">
              <SectionHeader
                eyebrow="Identificacao"
                title="Contexto e exposicao do risco"
                description="Registre atividade, agente, condicao e consequencias para manter a leitura operacional consistente."
              />

              <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                <FieldShell label="Atividade / processo">
                  <input
                    {...register(`itens_risco.${index}.atividade_processo`)}
                    className={compactFieldClass}
                    placeholder="Descreva a atividade ou etapa"
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  />
                </FieldShell>

                <FieldShell label="Agente ambiental">
                  <input
                    {...register(`itens_risco.${index}.agente_ambiental`)}
                    className={compactFieldClass}
                    placeholder="Agente ou exposicao dominante"
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  />
                </FieldShell>

                <FieldShell label="Condição perigosa">
                  <input
                    {...register(`itens_risco.${index}.condicao_perigosa`)}
                    className={compactFieldClass}
                    placeholder="Condição perigosa observada"
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  />
                </FieldShell>

                <FieldShell label="Fontes / circunstâncias">
                  <input
                    {...register(`itens_risco.${index}.fontes_circunstancias`)}
                    className={compactFieldClass}
                    placeholder="Origem, condicao ou circunstancia"
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  />
                </FieldShell>

                <FieldShell
                  label="Possíveis lesões"
                  className="lg:col-span-2 2xl:col-span-2"
                >
                  <input
                    {...register(`itens_risco.${index}.possiveis_lesoes`)}
                    className={compactFieldClass}
                    placeholder="Consequencias esperadas em caso de exposicao"
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  />
                </FieldShell>
              </div>
            </section>

            <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/94 p-4">
              <SectionHeader
                eyebrow="Matriz de risco"
                title="Classificacao e prioridade"
                description="Probabilidade e severidade alimentam a categoria, a prioridade e o criterio de acao."
                aside={
                  <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-2 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                      Score
                    </p>
                    <p className="mt-1 text-2xl font-black leading-none text-[var(--ds-color-text-primary)]">
                      {calc.score || "--"}
                    </p>
                  </div>
                }
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FieldShell label="Probabilidade">
                  <select
                    {...register(`itens_risco.${index}.probabilidade`)}
                    onChange={(event) => handleProbabilityChange(event.target.value)}
                    className={compactFieldClass}
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  >
                    <option value="">Selecione</option>
                    <option value="1">1 - Baixa</option>
                    <option value="2">2 - Media</option>
                    <option value="3">3 - Alta</option>
                  </select>
                </FieldShell>

                <FieldShell label="Severidade">
                  <select
                    {...register(`itens_risco.${index}.severidade`)}
                    onChange={(event) => handleSeverityChange(event.target.value)}
                    className={compactFieldClass}
                    data-apr-nav="risk-grid"
                    onKeyDown={handleAdvanceKeyDown}
                  >
                    <option value="">Selecione</option>
                    <option value="1">1 - Baixa</option>
                    <option value="2">2 - Media</option>
                    <option value="3">3 - Alta</option>
                  </select>
                </FieldShell>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/24 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                    Categoria
                  </p>
                  <span
                    className={cn(
                      "mt-3 inline-flex max-w-full truncate rounded-full px-3 py-1.5 text-xs font-semibold",
                      getCategoriaBadgeClass(calc.categoria),
                    )}
                  >
                    {calc.categoria || "Aguardando matriz"}
                  </span>
                  <p className="mt-3 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
                    {calc.actionCriteria ||
                      "Defina P x S para consolidar o nivel de risco."}
                  </p>
                </div>

                <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/24 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                    Prioridade
                  </p>
                  <span
                    className={cn(
                      "mt-3 inline-flex max-w-full truncate rounded-full px-3 py-1.5 text-xs font-semibold",
                      getPrioridadeBadgeClass(calc.prioridade),
                    )}
                  >
                    {getPriorityShortLabel(calc.prioridade)}
                  </span>
                  <p className="mt-3 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
                    {calc.score
                      ? `Priorizacao operacional baseada no score ${calc.score}.`
                      : "A prioridade sera liberada apos o fechamento da matriz."}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
            <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/94 p-4">
              <SectionHeader
                eyebrow="Controles preventivos"
                title="Medidas de prevencao"
                description="Registre barreiras, EPC/EPI, isolamentos, permissao, travamentos e demais controles operacionais."
              />

              <div className="mt-4">
                <FieldShell
                  label="Plano preventivo"
                  support="Descreva as medidas de forma acionavel e verificavel."
                >
                  <textarea
                    {...register(`itens_risco.${index}.medidas_prevencao`)}
                    rows={compactMode ? 5 : 6}
                    className={compactTextAreaClass}
                    placeholder="Ex.: isolar area, emitir permissao, sinalizar, validar EPC/EPI e definir conferencia antes da execucao."
                    data-apr-nav="risk-grid"
                  />
                </FieldShell>
              </div>
            </section>

            <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/94 p-4">
              <SectionHeader
                eyebrow="Governanca"
                title="Plano de acao e acompanhamento"
                description="Defina criterio, responsavel, prazo e estado de execucao para sustentar rastreabilidade."
                aside={
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold",
                      getToneClass(actionStatus.tone),
                    )}
                  >
                    {actionStatus.label}
                  </span>
                }
              />

              {isRowExpanded ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/28 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                      Criterio de acao
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ds-color-text-primary)]">
                      {calc.actionCriteria ||
                        "Defina probabilidade e severidade para completar a matriz e liberar o criterio."}
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_152px]">
                    <FieldShell label="Responsavel">
                      <input
                        {...register(`itens_risco.${index}.responsavel`)}
                        className={compactFieldClass}
                        placeholder="Responsavel pela acao"
                        data-apr-nav="risk-grid"
                        onKeyDown={handleAdvanceKeyDown}
                      />
                    </FieldShell>

                    <FieldShell label="Prazo">
                      <input
                        type="date"
                        {...register(`itens_risco.${index}.prazo`)}
                        className={compactFieldClass}
                        data-apr-nav="risk-grid"
                        onKeyDown={handleAdvanceKeyDown}
                      />
                    </FieldShell>
                  </div>

                  <FieldShell
                    label="Status da acao"
                    support="Use um status operacional objetivo, como aberta, em andamento, concluida ou bloqueada."
                  >
                    <input
                      {...register(`itens_risco.${index}.status_acao`)}
                      className={compactFieldClass}
                      placeholder="Aberta, em andamento, concluida..."
                      data-apr-nav="risk-grid"
                      onKeyDown={handleAdvanceKeyDown}
                    />
                  </FieldShell>
                </div>
              ) : (
                <div className="mt-4 rounded-[var(--ds-radius-xl)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/24 px-3 py-3">
                  <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    Governanca resumida no modo compacto
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
                    Expanda a linha para editar responsavel, prazo e status da
                    acao sem perder a leitura da matriz.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
});
