'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, PenLine, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/status-pill';

type PtReadinessPanelProps = {
  readyForRelease: boolean;
  blockers: string[];
  unansweredChecklistItems: number;
  adverseChecklistItems: number;
  pendingSignatures: number;
  hasRapidRiskBlocker: boolean;
  className?: string;
};

export function PtReadinessPanel({
  readyForRelease,
  blockers,
  unansweredChecklistItems,
  adverseChecklistItems,
  pendingSignatures,
  hasRapidRiskBlocker,
  className,
}: PtReadinessPanelProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--ds-radius-xl)] border px-5 py-4',
        readyForRelease
          ? 'border-[color:var(--ds-color-success)]/18 bg-[color:var(--ds-color-success-subtle)]/78'
          : 'border-[color:var(--ds-color-warning)]/18 bg-[color:var(--ds-color-warning-subtle)]/72',
        className,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-secondary)]">
            Prontidão operacional
          </p>
          <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
            {readyForRelease ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-[var(--ds-color-success)]" />
                PT pronta para revisão final
              </>
            ) : (
              <>
                <ShieldAlert className="h-5 w-5 text-[var(--ds-color-warning)]" />
                Pendências antes da liberação
              </>
            )}
          </h3>
          <p className="mt-2 text-sm text-[var(--ds-color-text-primary)]">
            {readyForRelease
              ? 'Os dados principais, os checklists críticos e as assinaturas mínimas já estão consistentes.'
              : 'Use este painel para identificar rapidamente o que ainda impede uma liberação segura da atividade.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:min-w-[280px]">
          <ReadinessMetric
            icon={<ClipboardCheck className="h-4 w-4" />}
            label="Sem resposta"
            value={String(unansweredChecklistItems)}
          />
          <ReadinessMetric
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Respostas críticas"
            value={String(adverseChecklistItems)}
          />
          <ReadinessMetric
            icon={<PenLine className="h-4 w-4" />}
            label="Assinaturas pendentes"
            value={String(pendingSignatures)}
          />
          <ReadinessMetric
            icon={<ShieldAlert className="h-4 w-4" />}
            label="Risco rápido"
            value={hasRapidRiskBlocker ? 'Ação' : 'OK'}
          />
        </div>
      </div>

      {blockers.length > 0 ? (
        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {blockers.map((blocker) => (
            <li
              key={blocker}
              className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)]/78 px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
            >
              {blocker}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-success)]/18 bg-[var(--ds-color-surface-base)]/78 px-3 py-2 text-sm text-[var(--ds-color-success)]">
          Nenhuma pendência crítica detectada neste momento. Revise a PT e salve a emissão.
        </div>
      )}
    </div>
  );
}

function ReadinessMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)]/76 px-3 py-2 text-[var(--ds-color-text-primary)]">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2">
        <StatusPill tone={value === 'OK' ? 'success' : value === 'Ação' ? 'warning' : 'neutral'}>
          {value}
        </StatusPill>
      </div>
    </div>
  );
}
