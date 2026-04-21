'use client';

import { memo } from 'react';
import {
  AlertTriangle,
  Clock,
  FileText,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSectionBoundary } from './DashboardSectionBoundary';

export type KpiTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

const KPI_TONE: Record<
  KpiTone,
  { shell: string; value: string; iconShell: string; icon: string }
> = {
  danger: {
    shell: 'ds-kpi-card ds-kpi-card--danger',
    value: 'text-[var(--ds-color-danger-fg)]',
    iconShell:
      'border-[var(--ds-color-danger-border)] bg-[color:color-mix(in_srgb,var(--ds-color-danger)_16%,var(--component-card-bg-elevated)_84%)]',
    icon: 'text-[var(--ds-color-danger)]',
  },
  warning: {
    shell: 'ds-kpi-card ds-kpi-card--warning',
    value: 'text-[var(--ds-color-warning-fg)]',
    iconShell:
      'border-[var(--ds-color-warning-border)] bg-[color:color-mix(in_srgb,var(--ds-color-warning)_16%,var(--component-card-bg-elevated)_84%)]',
    icon: 'text-[var(--ds-color-warning)]',
  },
  success: {
    shell: 'ds-kpi-card ds-kpi-card--success',
    value: 'text-[var(--ds-color-success-fg)]',
    iconShell:
      'border-[var(--ds-color-success-border)] bg-[color:color-mix(in_srgb,var(--ds-color-success)_16%,var(--component-card-bg-elevated)_84%)]',
    icon: 'text-[var(--ds-color-success)]',
  },
  info: {
    shell: 'ds-kpi-card ds-kpi-card--primary',
    value: 'text-[var(--ds-kpi-blue-fg)]',
    iconShell:
      'border-[var(--ds-kpi-blue-border)] bg-[color:color-mix(in_srgb,var(--ds-color-action-primary)_16%,var(--component-card-bg-elevated)_84%)]',
    icon: 'text-[var(--ds-color-action-primary)]',
  },
  neutral: {
    shell: 'ds-kpi-card ds-kpi-card--neutral',
    value: 'text-[var(--title)]',
    iconShell:
      'border-[var(--component-card-border)] bg-[color:color-mix(in_srgb,var(--ds-color-surface-muted)_72%,var(--component-card-bg-elevated)_28%)]',
    icon: 'text-[var(--ds-color-text-secondary)]',
  },
};

export interface KpiCardProps {
  label: string;
  value: string | number | null;
  sublabel?: string;
  tone: KpiTone;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'stable';
}

export const KpiCard = memo(function KpiCard({
  label,
  value,
  sublabel,
  tone,
  icon: Icon,
  trend,
}: KpiCardProps) {
  const t = KPI_TONE[tone];
  return (
    <div
      className={cn(
        'motion-safe:transition-all motion-safe:duration-200 hover:scale-[1.012] focus-within:ring-2 focus-within:ring-[var(--ds-color-action-primary)] focus-within:ring-offset-2',
        t.shell,
      )}
    >
      <div className="relative z-[1] flex items-center justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          {label}
        </p>
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center rounded-[1rem] border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]',
            t.iconShell,
          )}
        >
          <Icon className={cn('h-[1.15rem] w-[1.15rem]', t.icon)} aria-hidden="true" />
        </span>
      </div>
      <div className="relative z-[1] flex items-end gap-2">
        <p className={cn('text-[30px] font-black leading-none tracking-[-0.05em]', t.value)}>
          {value == null ? (
            <span className="inline-block h-8 w-20 motion-safe:animate-pulse rounded-lg bg-[var(--ds-color-border-subtle)]" aria-label="Carregando" />
          ) : (
            <span className="animate-fade-up inline-block">{value}</span>
          )}
        </p>
        {trend && trend !== 'stable' && (
          <span className="mb-1" aria-hidden="true">
            {trend === 'down'
              ? <TrendingDown className="h-4 w-4 text-[var(--ds-color-success)]" />
              : <TrendingUp className="h-4 w-4 text-[var(--ds-color-danger)]" />}
          </span>
        )}
      </div>
      {sublabel && (
        <p className="relative z-[1] text-xs leading-snug text-[var(--ds-color-text-secondary)]">
          {sublabel}
        </p>
      )}
    </div>
  );
});

export interface DashboardKPIsProps {
  loading: boolean;
  queueLoading: boolean;
  complianceScore: number | null;
  complianceTone: KpiTone;
  complianceLabel: string;
  criticalCount: number;
  highCount: number;
  criticalHighTotal: number;
  criticalHighTone: KpiTone;
  slaTotal: number;
  slaBreached: number;
  slaDueToday: number;
  documentsCount: number;
  healthCount: number;
  docHealthTotal: number;
  docHealthTone: KpiTone;
}

export function DashboardKPIs({
  loading,
  queueLoading,
  complianceScore,
  complianceTone,
  complianceLabel,
  criticalCount,
  highCount,
  criticalHighTotal,
  criticalHighTone,
  slaTotal,
  slaBreached,
  slaDueToday,
  documentsCount,
  healthCount,
  docHealthTotal,
  docHealthTone,
}: DashboardKPIsProps) {
  return (
    <DashboardSectionBoundary fallbackTitle="Indicadores">
      <section aria-label="Indicadores chave de desempenho">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Conformidade geral"
            value={loading ? null : `${complianceScore ?? 0}%`}
            sublabel={loading ? 'Calculando...' : complianceLabel}
            tone={complianceTone}
            icon={ShieldCheck}
            trend={complianceScore != null && complianceScore >= 98 ? 'stable' : 'up'}
          />
          <KpiCard
            label="Pendências críticas"
            value={queueLoading ? null : criticalHighTotal}
            sublabel={`${criticalCount} críticas · ${highCount} altas`}
            tone={criticalHighTone}
            icon={AlertTriangle}
            trend={criticalHighTotal > 0 ? 'up' : 'stable'}
          />
          <KpiCard
            label="SLA operacional"
            value={queueLoading ? null : `${slaTotal - slaBreached}/${slaTotal || 1}`}
            sublabel={slaBreached > 0 ? `${slaBreached} vencidos · ${slaDueToday} vencem hoje` : `${slaDueToday} vencem em 48h`}
            tone={slaBreached > 0 ? 'danger' : slaDueToday > 0 ? 'warning' : 'success'}
            icon={Clock}
          />
          <KpiCard
            label="Documentos & Saúde"
            value={queueLoading ? null : docHealthTotal}
            sublabel={`${documentsCount} docs · ${healthCount} saúde`}
            tone={docHealthTone}
            icon={FileText}
            trend={docHealthTotal > 0 ? 'up' : 'stable'}
          />
        </div>
      </section>
    </DashboardSectionBoundary>
  );
}
