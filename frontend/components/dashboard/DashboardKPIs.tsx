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
  { card: string; border: string; value: string; iconBg: string; accent: string; glow: string }
> = {
  danger:  { card: 'bg-gradient-to-br from-[var(--ds-color-danger-subtle)] to-[var(--ds-color-surface-base)]',  border: 'border-[var(--ds-color-danger-border)]',  value: 'text-[var(--ds-color-danger)]',  iconBg: 'bg-[var(--ds-color-danger)]',  accent: 'bg-[var(--ds-color-danger)]',  glow: 'shadow-[0_4px_24px_-4px_var(--ds-color-danger)]' },
  warning: { card: 'bg-gradient-to-br from-[var(--ds-color-warning-subtle)] to-[var(--ds-color-surface-base)]', border: 'border-[var(--ds-color-warning-border)]', value: 'text-[var(--ds-color-warning)]', iconBg: 'bg-[var(--ds-color-warning)]', accent: 'bg-[var(--ds-color-warning)]', glow: 'shadow-[0_4px_24px_-4px_var(--ds-color-warning)]' },
  success: { card: 'bg-gradient-to-br from-[var(--ds-color-success-subtle)] to-[var(--ds-color-surface-base)]', border: 'border-[var(--ds-color-success-border)]', value: 'text-[var(--ds-color-success)]', iconBg: 'bg-[var(--ds-color-success)]', accent: 'bg-[var(--ds-color-success)]', glow: 'shadow-[0_4px_24px_-4px_var(--ds-color-success)]' },
  info:    { card: 'bg-gradient-to-br from-[var(--ds-color-info-subtle)] to-[var(--ds-color-surface-base)]',    border: 'border-[var(--ds-color-info-border)]',    value: 'text-[var(--ds-color-info)]',    iconBg: 'bg-[var(--ds-color-info)]',    accent: 'bg-[var(--ds-color-info)]',    glow: 'shadow-[0_4px_24px_-4px_var(--ds-color-info)]' },
  neutral: { card: 'bg-[var(--ds-color-surface-muted)]',                                                         border: 'border-[var(--ds-color-border-default)]', value: 'text-[var(--title)]',            iconBg: 'bg-[var(--ds-color-border-strong)]', accent: 'bg-[var(--ds-color-border-strong)]', glow: 'shadow-[var(--ds-shadow-xs)]' },
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
        'relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 motion-safe:transition-all motion-safe:duration-200 hover:scale-[1.018] hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-[var(--ds-color-action-primary)] focus-within:ring-offset-2',
        t.card, t.border, t.glow,
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-[3px]', t.accent)} />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          {label}
        </p>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl shadow-sm', t.iconBg)}>
          <Icon className="h-4.5 w-4.5 text-white" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p className={cn('text-[30px] font-black leading-none tracking-[-0.04em]', t.value)}>
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
        <p className="text-xs leading-snug text-[var(--ds-color-text-secondary)]">{sublabel}</p>
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
