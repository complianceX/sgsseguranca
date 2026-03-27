"use client";

import React, { useCallback, useMemo } from "react";
import { useWatch, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AprFormData, AprRiskRowData } from "./aprForm.schema";
import { useAprCalculations } from "./useAprCalculations";

export const APR_RISK_GRID_LAYOUT_CLASS =
  "grid-cols-1 gap-3 md:grid-cols-2 xl:min-w-[1920px] xl:grid-cols-[84px_minmax(220px,1.2fr)_minmax(170px,0.9fr)_minmax(190px,1fr)_minmax(190px,1fr)_minmax(190px,1fr)_118px_118px_148px_176px_minmax(280px,1.2fr)_120px]";

type RiskRowCompleteness = "complete" | "partial" | "empty";

function getRiskRowCompleteness(item: AprRiskRowData | undefined): RiskRowCompleteness {
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

function GridField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)] xl:hidden">
        {label}
      </label>
      {children}
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
  onRemove: (index: number) => void;
  control: Control<AprFormData>;
  register: UseFormRegister<AprFormData>;
  setValue: UseFormSetValue<AprFormData>;
  aprFieldClass: string;
}) {
  const { evaluateRisk, getCategoriaBadgeClass, getPrioridadeBadgeClass } = useAprCalculations();

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

  const shellClass = isCritical
    ? "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] shadow-[0_0_0_1px_var(--ds-color-danger-border)]"
    : isInconsistent
      ? "border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)]"
      : isReady
        ? "border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)]"
        : hasStarted && isIncomplete
          ? "border-dashed border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)]"
          : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]";

  const compactFieldClass = cn(
    aprFieldClass,
    "min-h-[42px] px-3 py-2 text-[13px] leading-5 shadow-none",
  );
  const compactTextAreaClass = cn(compactFieldClass, "min-h-[98px] resize-y");

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

  return (
    <div
      key={fieldId}
      className={cn(
        "overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border shadow-[var(--ds-shadow-sm)] transition-all duration-200",
        shellClass,
      )}
    >
      <div className={cn("grid p-3 xl:items-start", APR_RISK_GRID_LAYOUT_CLASS)}>
        <div className="md:col-span-2 xl:col-span-1">
          <div className="flex h-full min-h-[104px] flex-col justify-between rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/84 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
                  Risco
                </p>
                <p className="mt-1 text-2xl font-black leading-none text-[var(--ds-color-text-primary)]">
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

            <div className="mt-3 flex flex-wrap gap-1.5">
              {isCritical && (
                <span className="inline-flex rounded-full border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-danger)]">
                  Crítico
                </span>
              )}
              {isPriorityHigh && !isCritical && (
                <span className="inline-flex rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                  Alta prioridade
                </span>
              )}
              {isInconsistent && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-info)]">
                  <AlertTriangle className="h-3 w-3" />
                  Sem medida
                </span>
              )}
              {hasStarted && isIncomplete && (
                <span className="inline-flex rounded-full border border-dashed border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                  Incompleta
                </span>
              )}
              {isReady && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--color-success)]">
                  <CheckCircle2 className="h-3 w-3" />
                  Pronta
                </span>
              )}
            </div>
          </div>
        </div>

        <GridField label="Atividade / processo">
          <input
            {...register(`itens_risco.${index}.atividade_processo`)}
            className={compactFieldClass}
            placeholder="Atividade / processo"
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          />
        </GridField>

        <GridField label="Agente ambiental">
          <input
            {...register(`itens_risco.${index}.agente_ambiental`)}
            className={compactFieldClass}
            placeholder="Agente ambiental"
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          />
        </GridField>

        <GridField label="Condição perigosa">
          <input
            {...register(`itens_risco.${index}.condicao_perigosa`)}
            className={compactFieldClass}
            placeholder="Condição perigosa"
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          />
        </GridField>

        <GridField label="Fontes / circunstâncias">
          <input
            {...register(`itens_risco.${index}.fontes_circunstancias`)}
            className={compactFieldClass}
            placeholder="Fontes / circunstâncias"
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          />
        </GridField>

        <GridField label="Possíveis lesões">
          <input
            {...register(`itens_risco.${index}.possiveis_lesoes`)}
            className={compactFieldClass}
            placeholder="Possíveis lesões"
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          />
        </GridField>

        <GridField label="Probabilidade">
          <select
            {...register(`itens_risco.${index}.probabilidade`)}
            onChange={(event) => handleProbabilityChange(event.target.value)}
            className={compactFieldClass}
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          >
            <option value="">P</option>
            <option value="1">1 - Baixa</option>
            <option value="2">2 - Média</option>
            <option value="3">3 - Alta</option>
          </select>
        </GridField>

        <GridField label="Severidade">
          <select
            {...register(`itens_risco.${index}.severidade`)}
            onChange={(event) => handleSeverityChange(event.target.value)}
            className={compactFieldClass}
            data-apr-nav="risk-grid"
            onKeyDown={handleAdvanceKeyDown}
          >
            <option value="">S</option>
            <option value="1">1 - Baixa</option>
            <option value="2">2 - Média</option>
            <option value="3">3 - Alta</option>
          </select>
        </GridField>

        <GridField label="Categoria">
          <div className="flex min-h-[42px] flex-col justify-center rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
            <span
              className={cn(
                "inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold",
                getCategoriaBadgeClass(calc.categoria),
              )}
            >
              {calc.categoria || "Aguardando P x S"}
            </span>
            <span className="mt-1 text-[11px] font-medium text-[var(--ds-color-text-secondary)]">
              Score {calc.score || "-"}
            </span>
          </div>
        </GridField>

        <GridField label="Prioridade">
          <div className="flex min-h-[42px] flex-col justify-center rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
            <span
              className={cn(
                "inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold",
                getPrioridadeBadgeClass(calc.prioridade),
              )}
            >
              {calc.prioridade || "Sem prioridade"}
            </span>
            <span className="mt-1 line-clamp-2 text-[11px] text-[var(--ds-color-text-secondary)]">
              {calc.actionCriteria || "Selecione probabilidade e severidade para gerar o critério de ação."}
            </span>
          </div>
        </GridField>

        <GridField label="Medidas de prevenção" className="md:col-span-2 xl:col-span-1">
          <textarea
            {...register(`itens_risco.${index}.medidas_prevencao`)}
            rows={compactMode ? 3 : 4}
            className={compactTextAreaClass}
            placeholder="Medidas, barreiras, EPC/EPI, permissões, isolamentos..."
            data-apr-nav="risk-grid"
          />
        </GridField>

        <GridField label="Ações" className="md:col-span-2 xl:col-span-1">
          <div className="flex min-h-[42px] flex-wrap items-start gap-1.5 xl:justify-center">
            <button
              type="button"
              onClick={() => onMove(index, index - 1)}
              disabled={readOnly || index === 0}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] p-2 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-30"
              title="Mover para cima"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(index, index + 1)}
              disabled={readOnly || index === totalRows - 1}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] p-2 text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-30"
              title="Mover para baixo"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDuplicate(index)}
              disabled={readOnly}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] p-2 text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/80 disabled:opacity-40"
              title="Duplicar linha"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRemove(index)}
              disabled={readOnly}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] p-2 text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]/80 disabled:opacity-40"
              title="Remover linha"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </GridField>

        {isRowExpanded && (
          <div className="md:col-span-2 xl:col-[2/-1]">
            <div className="grid gap-3 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/76 px-4 py-3 lg:grid-cols-[minmax(240px,1.1fr)_minmax(220px,0.95fr)_150px_170px]">
              <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                  Critério de ação
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {calc.actionCriteria || "Defina probabilidade e severidade para completar a matriz."}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  Responsável
                </label>
                <input
                  {...register(`itens_risco.${index}.responsavel`)}
                  className={compactFieldClass}
                  placeholder="Responsável pela ação"
                  data-apr-nav="risk-grid"
                  onKeyDown={handleAdvanceKeyDown}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  Prazo
                </label>
                <input
                  type="date"
                  {...register(`itens_risco.${index}.prazo`)}
                  className={compactFieldClass}
                  data-apr-nav="risk-grid"
                  onKeyDown={handleAdvanceKeyDown}
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  Status da ação
                </label>
                <input
                  {...register(`itens_risco.${index}.status_acao`)}
                  className={compactFieldClass}
                  placeholder="Aberta, em andamento..."
                  data-apr-nav="risk-grid"
                  onKeyDown={handleAdvanceKeyDown}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
