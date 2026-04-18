"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { aprsService, AprValidationResult, AprRuleViolation } from "@/services/aprsService";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface AprCompliancePanelProps {
  aprId: string | null;
  formVersion?: number;
  onValidationChange?: (result: AprValidationResult | null) => void;
}

function ScoreSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-10 w-24 rounded bg-[var(--ds-color-surface-muted)]" />
      <div className="h-2 w-full rounded-full bg-[var(--ds-color-surface-muted)]" />
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 w-full rounded bg-[var(--ds-color-surface-muted)]" />
        ))}
      </div>
    </div>
  );
}

function ViolationItem({ v }: { v: AprRuleViolation }) {
  const isBlocker = v.severity === "BLOQUEANTE";
  return (
    <div
      className={cn(
        "rounded-[var(--ds-radius-md)] border px-3 py-2.5 text-sm",
        isBlocker
          ? "border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]"
          : "border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]",
      )}
    >
      <p className="font-semibold text-[var(--ds-color-text-primary)]">
        {isBlocker ? "⛔" : "⚠"} {v.title}
      </p>
      <p className="mt-0.5 text-[var(--ds-color-text-secondary)]">{v.operationalMessage}</p>
      {v.remediation && (
        <p className="mt-1 text-xs text-[var(--ds-color-text-tertiary)]">
          Correção: {v.remediation}
        </p>
      )}
      {v.nrReference && (
        <p className="mt-0.5 text-xs font-medium text-[var(--ds-color-text-secondary)]">
          Ref.: {v.nrReference}
        </p>
      )}
    </div>
  );
}

export function AprCompliancePanel({
  aprId,
  formVersion = 0,
  onValidationChange,
}: AprCompliancePanelProps) {
  const [result, setResult] = useState<AprValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onValidationChangeRef = useRef(onValidationChange);
  onValidationChangeRef.current = onValidationChange;

  const load = useCallback(async () => {
    if (!aprId) return;
    setLoading(true);
    try {
      const data = await aprsService.validateCompliance(aprId);
      setResult(data);
      onValidationChangeRef.current?.(data);
    } catch {
      setResult(null);
      onValidationChangeRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, [aprId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load();
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load, formVersion]);

  if (!aprId) return null;

  const scoreColor =
    result === null
      ? "text-[var(--ds-color-text-secondary)]"
      : result.score >= 80
        ? "text-[var(--color-success)]"
        : result.score >= 50
          ? "text-[var(--color-warning)]"
          : "text-[var(--color-danger)]";

  const barColor =
    result === null
      ? "bg-[var(--ds-color-surface-muted)]"
      : result.score >= 80
        ? "bg-[var(--color-success)]"
        : result.score >= 50
          ? "bg-[var(--color-warning)]"
          : "bg-[var(--color-danger)]";

  return (
    <div className="sst-card p-4 space-y-4" id="apr-compliance-panel">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
        Conformidade SST
      </h2>

      {loading && !result ? (
        <ScoreSkeleton />
      ) : (
        <>
          {/* Score */}
          <div className="space-y-1.5">
            <span className={cn("text-4xl font-bold tabular-nums", scoreColor)}>
              {result?.score ?? "—"}
            </span>
            <span className="ml-1 text-sm text-[var(--ds-color-text-secondary)]">/100</span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]">
              <div
                className={cn("h-full rounded-full transition-all duration-500", barColor)}
                style={{ width: `${result?.score ?? 0}%` }}
              />
            </div>
            {loading && result && (
              <p className="text-xs text-[var(--ds-color-text-tertiary)]">Atualizando...</p>
            )}
          </div>

          {/* APR conforme */}
          {result && result.isValid && result.warnings.length === 0 && (
            <div className="flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-2">
              <span className="text-sm font-semibold text-[var(--color-success)]">
                ✓ APR conforme — sem pendências
              </span>
            </div>
          )}

          {/* Blockers */}
          {result && result.blockers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-danger)]">
                Pendências críticas ({result.blockers.length})
              </p>
              {result.blockers.map((v) => (
                <ViolationItem key={v.ruleCode} v={v} />
              ))}
            </div>
          )}

          {/* Warnings */}
          {result && result.warnings.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setWarningsOpen((o) => !o)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-warning)] hover:opacity-80"
              >
                <span>Advertências ({result.warnings.length})</span>
                {warningsOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {warningsOpen &&
                result.warnings.map((v) => <ViolationItem key={v.ruleCode} v={v} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
