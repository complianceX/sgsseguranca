import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";

import type {
  AprDocumentRiskLevel,
  AprDocumentRiskSummary,
} from "./aprFormUtils";
import { cn } from "@/lib/utils";

export type AprDocumentRiskLevelStyle = {
  key: AprDocumentRiskLevel;
  label: string;
  tone: string;
  subtle: string;
};

export const APR_DOCUMENT_RISK_LEVELS: AprDocumentRiskLevelStyle[] = [
  {
    key: "insignificante",
    label: "Insignificante",
    tone: "bg-[var(--ds-color-border-strong)]",
    subtle: "bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
  },
  {
    key: "baixo",
    label: "Baixo",
    tone: "bg-emerald-600",
    subtle: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "medio",
    label: "Médio",
    tone: "bg-amber-600",
    subtle: "bg-amber-50 text-amber-700",
  },
  {
    key: "alto",
    label: "Alto",
    tone: "bg-orange-600",
    subtle: "bg-orange-50 text-orange-700",
  },
  {
    key: "critico",
    label: "Crítico",
    tone: "bg-red-600",
    subtle: "bg-red-50 text-red-700",
  },
];

export function DocumentInfoCell({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-h-[108px] border-b border-r border-[var(--ds-color-border-subtle)] px-4 py-3 last:border-r-0 md:last:border-r xl:border-b-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[var(--ds-color-text-primary)]">
            {value}
          </p>
          {helper ? (
            <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
              {helper}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DocumentRiskSummaryList({
  summary,
  levels,
}: {
  summary: AprDocumentRiskSummary;
  levels: AprDocumentRiskLevelStyle[];
}) {
  const denominator = Math.max(summary.total, 1);

  return (
    <div className="mt-4 space-y-3">
      {levels.map((level) => {
        const count = summary.counts[level.key];
        const width = `${Math.round((count / denominator) * 100)}%`;

        return (
          <div key={level.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", level.tone)} />
                <span className="font-medium text-[var(--ds-color-text-primary)]">
                  {level.label}
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold",
                  level.subtle,
                )}
              >
                {count}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--ds-color-surface-base)]">
              <div
                className={cn("h-full rounded-full", level.tone)}
                style={{ width }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DocumentSignatureCard({
  title,
  name,
  detail,
  state,
}: {
  title: string;
  name: string;
  detail: string;
  state: "done" | "pending";
}) {
  const isDone = state === "done";

  return (
    <div
      className={cn(
        "min-h-[116px] rounded-lg border px-4 py-3",
        isDone
          ? "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)]/35"
          : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
            {title}
          </p>
          <p className="mt-2 truncate text-sm font-black text-[var(--ds-color-text-primary)]">
            {name}
          </p>
        </div>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isDone
              ? "bg-[var(--color-success)] text-[var(--color-text-inverse)]"
              : "bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]",
          )}
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
        {detail}
      </p>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/26 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

export function SummaryMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-5 text-[var(--ds-color-text-primary)]">
        {value}
      </p>
    </div>
  );
}

export function WizardMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "info" | "warning" | "success";
}) {
  const tones = {
    default: {
      container:
        "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/16 text-[var(--ds-color-text-primary)]",
      label: "text-[var(--ds-color-text-secondary)]",
    },
    info: {
      container:
        "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]",
      label: "text-[var(--color-info)] opacity-80",
    },
    warning: {
      container:
        "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]",
      label: "text-[var(--color-warning)] opacity-80",
    },
    success: {
      container:
        "border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]",
      label: "text-[var(--color-success)] opacity-80",
    },
  };

  return (
    <div
      className={`rounded-[var(--ds-radius-md)] border px-2.5 py-2 ${tones[tone].container}`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${tones[tone].label}`}
      >
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

export function AprRiskGridHeader({
  hiddenCompactDetailsCount,
}: {
  hiddenCompactDetailsCount: number;
}) {
  return (
    <div className="sticky top-0 z-10 hidden border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/96 px-3 py-3 backdrop-blur xl:block">
      <div className="grid gap-3 xl:grid-cols-[124px_minmax(0,1fr)]">
        <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
            Linha
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Identificação e ações rápidas
          </p>
          <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
            Arraste para reordenar
          </p>
          {hiddenCompactDetailsCount > 0 ? (
            <span className="mt-2 inline-flex rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
              {hiddenCompactDetailsCount} linha(s) com detalhes ocultos
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.32fr)_minmax(360px,0.88fr)]">
          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Estrutura do risco
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Identificação, exposição e matriz de classificação
            </p>
          </div>

          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Governança
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Medidas preventivas, responsável, prazo e status da ação
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCriteriaCard({
  categoria,
  prioridade,
  criterio,
}: {
  categoria: string;
  prioridade: string;
  criterio: string;
}) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
            categoria === "Aceitável"
              ? "risk-badge-acceptable"
              : categoria === "Atenção"
                ? "risk-badge-attention"
                : categoria === "Substancial"
                  ? "risk-badge-substantial"
                  : "risk-badge-critical",
          )}
        >
          {categoria}
        </span>
        <span className="text-[11px] font-semibold text-[var(--ds-color-text-secondary)]">
          {prioridade}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
        {criterio}
      </p>
    </div>
  );
}

export function AprRiskReferencePanel({
  getActionCriteriaText,
}: {
  getActionCriteriaText: (
    categoria?: string,
    variant?: "short" | "long",
  ) => string | undefined;
}) {
  return (
    <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
      <div className="border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Referência operacional
        </p>
        <h3 className="mt-1.5 text-sm font-black text-[var(--ds-color-text-primary)]">
          Matriz P x S e critério de ação
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-[var(--ds-color-text-secondary)]">
          Consulta rápida para conferência, sem competir com a grade.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <details
          open
          className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/14"
        >
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Matriz de risco P x S
          </summary>
          <div className="border-t border-[var(--ds-color-border-subtle)] p-3">
            <div className="overflow-x-auto rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)]">
              <table className="apr-tech-table w-full min-w-[420px] table-auto text-sm">
                <thead>
                  <tr>
                    <th>Prob. \\ Sev.</th>
                    <th>1</th>
                    <th>2</th>
                    <th>3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold">1</td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">2</td>
                    <td className="risk-badge-acceptable text-center font-bold">
                      Aceitável
                    </td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                    <td className="risk-badge-substantial text-center font-bold">
                      Substancial
                    </td>
                  </tr>
                  <tr>
                    <td className="font-bold">3</td>
                    <td className="risk-badge-attention text-center font-bold">
                      Atenção
                    </td>
                    <td className="risk-badge-substantial text-center font-bold">
                      Substancial
                    </td>
                    <td className="risk-badge-critical text-center font-bold">
                      Crítico
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details className="overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/14">
          <summary className="cursor-pointer list-none px-3.5 py-2.5 text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Critério de ação por categoria
          </summary>
          <div className="space-y-2 border-t border-[var(--ds-color-border-subtle)] p-3 text-sm">
            <ActionCriteriaCard
              categoria="Aceitável"
              prioridade="Não prioritário"
              criterio={getActionCriteriaText("Aceitável", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Atenção"
              prioridade="Prioridade básica"
              criterio={getActionCriteriaText("Atenção", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Substancial"
              prioridade="Prioridade preferencial"
              criterio={getActionCriteriaText("Substancial", "long") || "-"}
            />
            <ActionCriteriaCard
              categoria="Crítico"
              prioridade="Prioridade máxima"
              criterio={getActionCriteriaText("Crítico", "long") || "-"}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

export function LegendItem({
  tone,
  label,
  description,
}: {
  tone: "critical" | "incomplete" | "ready" | "priority";
  label: string;
  description: string;
}) {
  const toneClasses = {
    critical: {
      container:
        "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)]",
      dot: "border-[var(--ds-color-danger-border)] bg-[var(--risk-critical)]",
    },
    incomplete: {
      container:
        "border-[var(--apr-incomplete-border)] bg-[var(--apr-incomplete-subtle)] text-[var(--apr-incomplete-fg)]",
      dot: "border-[var(--apr-incomplete-border)] bg-[var(--apr-incomplete)]",
    },
    ready: {
      container:
        "border-[var(--apr-ready-border)] bg-[var(--apr-ready-subtle)] text-[var(--apr-ready-fg)]",
      dot: "border-[var(--apr-ready-border)] bg-[var(--apr-ready)]",
    },
    priority: {
      container:
        "border-[var(--apr-priority-border)] bg-[var(--apr-priority-subtle)] text-[var(--apr-priority-fg)]",
      dot: "border-[var(--apr-priority-border)] bg-[var(--apr-priority)]",
    },
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--ds-radius-md)] border px-3 py-2.5",
        toneClasses[tone].container,
      )}
    >
      <span
        className={cn(
          "mt-1 h-2.5 w-2.5 rounded-full border",
          toneClasses[tone].dot,
        )}
      />
      <div>
        <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
          {label}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

interface SectionItem {
  id: string;
  nome?: string;
  razao_social?: string;
  titulo?: string;
}

export interface SectionGridProps {
  title: string;
  items: SectionItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  error?: string;
  signatures?: Record<string, { data: string; type: string }>;
  helperText?: string;
}

export function SectionGrid({
  title,
  items,
  selectedIds,
  onToggle,
  error,
  signatures,
  helperText,
}: SectionGridProps) {
  const selectedCount = selectedIds.length;
  const signedCount = selectedIds.filter((id) => Boolean(signatures?.[id])).length;

  return (
    <div className="overflow-hidden rounded-[calc(var(--ds-radius-xl)+2px)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]">
      <div className="flex flex-col gap-3 border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/12 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
            Governança de participação
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--ds-color-text-primary)]">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--ds-color-text-secondary)]">
            {helperText ||
              "Selecione quem participa da APR e acompanhe quem já concluiu a assinatura."}
          </p>
          <p className="mt-2 text-xs text-[var(--ds-color-text-muted)]">
            Ao selecionar um participante novo, o fluxo abre a captura de
            assinatura imediatamente quando a APR estiver online.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1 font-semibold text-[var(--ds-color-text-secondary)]">
            {selectedCount} no fluxo
          </span>
          <span className="rounded-full border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-1 font-semibold text-[var(--color-success)]">
            {signedCount} assinados
          </span>
        </div>
      </div>
      {error && (
        <div className="border-b border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-2.5 text-xs text-[var(--color-danger)]">
          <p className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> {error}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const hasSignature = Boolean(signatures?.[item.id]);
          const displayName = item.nome || item.razao_social || item.titulo;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              aria-label={
                hasSignature
                  ? `${displayName}: participante assinado. Clique para remover do fluxo.`
                  : isSelected
                    ? `${displayName}: participante selecionado. Clique para remover do fluxo.`
                    : `${displayName}: selecionar participante e abrir captura de assinatura.`
              }
              className={cn(
                "flex min-h-[76px] items-start gap-3 rounded-[var(--ds-radius-lg)] border px-3.5 py-3 text-left motion-safe:transition-colors",
                isSelected
                  ? "border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)]"
                  : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] hover:bg-[var(--ds-color-surface-muted)]/16",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold motion-safe:transition-colors",
                  isSelected
                    ? "border-[var(--color-info)] bg-[var(--color-info)] text-[var(--color-text-inverse)]"
                    : "border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]",
                )}
              >
                {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : "+"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {displayName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                      {hasSignature
                        ? "Assinatura capturada e participante mantido no fluxo."
                        : isSelected
                          ? "Selecionado no fluxo. Clique para remover se necessário."
                          : "Clique para selecionar e abrir a captura de assinatura."}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                        hasSignature
                          ? "border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]"
                          : isSelected
                            ? "border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]"
                            : "border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
                      )}
                    >
                      {hasSignature
                        ? "Assinado"
                        : isSelected
                          ? "Selecionado"
                          : "Disponível"}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--ds-color-text-muted)]">
                      {hasSignature
                        ? "Remover"
                        : isSelected
                          ? "Retirar"
                          : "Assinar"}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="col-span-full rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 py-6 text-center text-sm italic text-[var(--color-text-secondary)]">
            Nenhum item disponível para a empresa selecionada.
          </div>
        )}
      </div>
    </div>
  );
}
