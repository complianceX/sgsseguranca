"use client";

import React, { useCallback, useMemo } from "react";
import { useWatch, type Control, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import {
  AlertTriangle,
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
  aprLabelCompactClass,
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
  aprLabelCompactClass: string;
}) {
  const { evaluateRisk, getCategoriaBadgeClass } = useAprCalculations();

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

  const completeness = useMemo(
    () => getRiskRowCompleteness(item),
    [item],
  );

  const isCritical = calc.categoria === "Crítico";
  const isSubstantial = calc.categoria === "Substancial";
  const isIncomplete = !probabilidade || !severidade;
  const isRowExpanded = !compactMode || expanded;

  const borderClass = isCritical
    ? "border-[var(--ds-color-danger-border)] shadow-[0_0_0_1px_var(--ds-color-danger-border)]"
    : isSubstantial
      ? "border-[var(--ds-color-warning-border)]"
      : isIncomplete && (item?.atividade_processo || item?.condicao_perigosa)
        ? "border-dashed border-[var(--ds-color-warning-border)]"
        : "border-[var(--color-border-subtle)]";

  const completenessColor =
    completeness === "complete"
      ? "bg-[var(--color-success)]"
      : completeness === "partial"
        ? "bg-[var(--color-warning)]"
        : "bg-[var(--ds-color-text-muted)]/40";

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
        "rounded-[var(--ds-radius-xl)] border bg-[color:var(--color-card)] shadow-[var(--ds-shadow-sm)] transition-all",
        borderClass,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between",
          isRowExpanded
            ? "border-b border-[var(--color-border-subtle)] pb-4"
            : "pb-3",
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn("h-2.5 w-2.5 rounded-full shrink-0", completenessColor)}
            title={
              completeness === "complete"
                ? "Linha completa"
                : completeness === "partial"
                  ? "Linha incompleta"
                  : "Linha vazia"
            }
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              Risco #{index + 1}
            </p>
            {compactMode && !isRowExpanded && item?.atividade_processo && (
              <p className="mt-0.5 truncate text-sm text-[var(--ds-color-text-secondary)]">
                {item.atividade_processo}
                {item.condicao_perigosa ? ` — ${item.condicao_perigosa}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
              getCategoriaBadgeClass(calc.categoria),
            )}
          >
            {calc.categoria || "Não definida"}
          </span>
          {isIncomplete && (item?.atividade_processo || item?.condicao_perigosa) && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]"
              title="Probabilidade/Severidade não preenchidas"
            >
              <AlertTriangle className="h-3 w-3" />
              P/S
            </span>
          )}
          {compactMode && (
            <button
              type="button"
              onClick={() => onToggleExpanded(index)}
              className="rounded-[var(--ds-radius-md)] p-1.5 text-[var(--ds-color-text-muted)] transition-colors hover:bg-[color:var(--color-card-muted)]"
              title={isRowExpanded ? "Recolher" : "Expandir"}
            >
              {isRowExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => onMove(index, index - 1)}
            disabled={readOnly || index === 0}
            className="rounded-[var(--ds-radius-md)] p-1.5 text-[var(--ds-color-text-muted)] transition-colors hover:bg-[color:var(--color-card-muted)] disabled:opacity-30"
            title="Mover para cima"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, index + 1)}
            disabled={readOnly || index === totalRows - 1}
            className="rounded-[var(--ds-radius-md)] p-1.5 text-[var(--ds-color-text-muted)] transition-colors hover:bg-[color:var(--color-card-muted)] disabled:opacity-30"
            title="Mover para baixo"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(index)}
            disabled={readOnly}
            className="rounded-[var(--ds-radius-md)] bg-[color:var(--ds-color-primary-subtle)] p-1.5 text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/78"
            title="Duplicar linha"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={readOnly}
            className="rounded-[var(--ds-radius-md)] bg-[color:var(--ds-color-danger-subtle)] p-1.5 text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]/78"
            title="Remover linha"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isRowExpanded && (
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className={aprLabelCompactClass}>Atividade / Processo</label>
              <input
                {...register(`itens_risco.${index}.atividade_processo`)}
                className={aprFieldClass}
                placeholder="Atividade/processo"
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Agente ambiental</label>
              <input
                {...register(`itens_risco.${index}.agente_ambiental`)}
                className={aprFieldClass}
                placeholder="Agente ambiental"
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Condição perigosa</label>
              <input
                {...register(`itens_risco.${index}.condicao_perigosa`)}
                className={aprFieldClass}
                placeholder="Condição perigosa"
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Fontes / circunstâncias</label>
              <input
                {...register(`itens_risco.${index}.fontes_circunstancias`)}
                className={aprFieldClass}
                placeholder="Fontes ou circunstâncias"
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Possíveis lesões</label>
              <input
                {...register(`itens_risco.${index}.possiveis_lesoes`)}
                className={aprFieldClass}
                placeholder="Possíveis lesões"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
              <div>
                <label className={aprLabelCompactClass}>Probabilidade</label>
                <select
                  {...register(`itens_risco.${index}.probabilidade`)}
                  onChange={(event) => handleProbabilityChange(event.target.value)}
                  className={aprFieldClass}
                >
                  <option value="">Selecione</option>
                  <option value="1">1 - Baixa</option>
                  <option value="2">2 - Média</option>
                  <option value="3">3 - Alta</option>
                </select>
              </div>
              <div>
                <label className={aprLabelCompactClass}>Severidade</label>
                <select
                  {...register(`itens_risco.${index}.severidade`)}
                  onChange={(event) => handleSeverityChange(event.target.value)}
                  className={aprFieldClass}
                >
                  <option value="">Selecione</option>
                  <option value="1">1 - Baixa</option>
                  <option value="2">2 - Média</option>
                  <option value="3">3 - Alta</option>
                </select>
              </div>
            </div>

            <div
              className={cn(
                "rounded-[var(--ds-radius-lg)] border px-4 py-2.5",
                isCritical
                  ? "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]/40"
                  : isSubstantial
                    ? "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]/40"
                    : "border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                  Avaliação:
                </span>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    getCategoriaBadgeClass(calc.categoria),
                  )}
                >
                  {calc.categoria || "Não definida"}
                </span>
                <span className="text-xs text-[var(--ds-color-text-secondary)]">
                  Prioridade: <strong>{calc.prioridade || "-"}</strong>
                </span>
                <span className="text-xs text-[var(--ds-color-text-secondary)]">
                  Score: <strong>{calc.score || "-"}</strong>
                </span>
              </div>
              {calc.categoria && calc.actionCriteria && (
                <p className="mt-1.5 text-xs text-[var(--ds-color-text-muted)]">
                  <strong>Critério de ação:</strong> {calc.actionCriteria}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className={aprLabelCompactClass}>Medidas de prevenção</label>
            <textarea
              {...register(`itens_risco.${index}.medidas_prevencao`)}
              rows={3}
              className={aprFieldClass}
              placeholder="Descreva as barreiras, controles e medidas preventivas."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={aprLabelCompactClass}>Responsável</label>
              <input
                {...register(`itens_risco.${index}.responsavel`)}
                className={aprFieldClass}
                placeholder="Responsável pela ação"
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Prazo</label>
              <input
                type="date"
                {...register(`itens_risco.${index}.prazo`)}
                className={aprFieldClass}
              />
            </div>
            <div>
              <label className={aprLabelCompactClass}>Status da ação</label>
              <input
                {...register(`itens_risco.${index}.status_acao`)}
                className={aprFieldClass}
                placeholder="Aberta, em andamento, concluída..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
