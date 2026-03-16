'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  type LucideIcon,
  Shield,
  FileText,
  ClipboardCheck,
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  AlertTriangle,
  FileStack,
  ArrowUpRight,
  MessageSquare,
  CheckCheck,
} from 'lucide-react';
import {
  dashboardService,
  DashboardPendingQueueResponse,
  DashboardSummaryResponse,
} from '@/services/dashboardService';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { useAuth } from '@/context/AuthContext';
import { format, isBefore } from 'date-fns';
import { StatusPill } from '@/components/ui/status-pill';
import { isAiEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';

type QueueFilter = 'all' | 'critical' | 'documents' | 'health' | 'actions';

const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'critical', label: 'Críticas' },
  { id: 'documents', label: 'Documentos' },
  { id: 'health', label: 'Saúde ocupacional' },
  { id: 'actions', label: 'Ações' },
];

function formatDateOnly(value?: string | number | Date | null) {
  if (!value) return 'Sem prazo';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sem prazo';
  return format(d, 'dd/MM/yyyy');
}

function resolveQueuePriorityClasses(priority: 'critical' | 'high' | 'medium') {
  switch (priority) {
    case 'critical': return 'bg-[color:var(--ds-color-danger)]';
    case 'high': return 'bg-[color:var(--ds-color-warning)]';
    default: return 'bg-[color:var(--ds-color-info)]';
  }
}

function resolveQueueModuleIcon(module: string): LucideIcon {
  switch (module) {
    case 'APR': return Shield;
    case 'PT': return FileText;
    case 'Checklist': return ClipboardCheck;
    case 'NC': return AlertTriangle;
    case 'Treinamento': return GraduationCap;
    case 'ASO': return AlertCircle;
    case 'Ação': return CheckCheck;
    default: return FileStack;
  }
}

type PendingQueueEntry = DashboardPendingQueueResponse['items'][number];

function buildPendingQueueSophieHref(item: PendingQueueEntry) {
  const params = new URLSearchParams({
    pendingContext: 'true',
    module: item.module,
    category: item.category,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    href: item.href,
  });
  if (item.sourceId) params.set('sourceId', item.sourceId);
  if (item.siteId) params.set('site_id', item.siteId);
  if (item.site) params.set('site_name', item.site);
  if (item.responsible) params.set('responsible', item.responsible);
  if (item.dueDate) params.set('dueDate', item.dueDate);
  return `/dashboard/sst-agent?${params.toString()}`;
}

export default function DashboardPage() {
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expiringEpis, setExpiringEpis] = useState<DashboardSummaryResponse['expiringEpis']>([]);
  const [expiringTrainings, setExpiringTrainings] = useState<DashboardSummaryResponse['expiringTrainings']>([]);
  const [pendingQueue, setPendingQueue] = useState<DashboardPendingQueueResponse>({
    summary: { total: 0, critical: 0, high: 0, medium: 0, documents: 0, health: 0, actions: 0 },
    items: [],
  });
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

  const canUseAi = hasPermission('can_use_ai');

  const filteredPendingQueueItems = useMemo(() => {
    if (queueFilter === 'all') return pendingQueue.items.slice(0, 12);
    if (queueFilter === 'critical') return pendingQueue.items.filter((item) => item.priority === 'critical').slice(0, 12);
    return pendingQueue.items.filter((item) => item.category === queueFilter).slice(0, 12);
  }, [pendingQueue.items, queueFilter]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [summaryR, pendingQueueR] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getPendingQueue(),
        ]);

        if (summaryR.status === 'fulfilled') {
          const summary = summaryR.value;
          setExpiringEpis(summary.expiringEpis);
          setExpiringTrainings(summary.expiringTrainings);
        }

        if (pendingQueueR.status === 'fulfilled') {
          setPendingQueue(pendingQueueR.value);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const expiredEpisCount = expiringEpis.filter((epi) => isBefore(new Date(epi.validade_ca || ''), new Date())).length;
  const expiredTrainingsCount = expiringTrainings.filter((t) => isBefore(new Date(t.data_vencimento), new Date())).length;

  const kpis = [
    {
      label: 'Pendências críticas',
      value: loading ? '—' : pendingQueue.summary.critical.toString(),
      tone: pendingQueue.summary.critical > 0 ? 'danger' : 'success',
    },
    {
      label: 'Total de pendências',
      value: loading ? '—' : pendingQueue.summary.total.toString(),
      tone: pendingQueue.summary.total > 0 ? 'warning' : 'success',
    },
    {
      label: 'EPIs vencidos',
      value: loading ? '—' : expiredEpisCount.toString(),
      tone: expiredEpisCount > 0 ? 'danger' : 'success',
    },
    {
      label: 'Treinamentos vencidos',
      value: loading ? '—' : expiredTrainingsCount.toString(),
      tone: expiredTrainingsCount > 0 ? 'danger' : 'success',
    },
  ] as const;

  const kpiToneClasses: Record<string, string> = {
    danger: 'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]',
    warning: 'border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
    success: 'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 text-[var(--ds-color-success)]',
  };

  return (
    <div className="ds-dashboard-shell">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={cn('rounded-xl border px-4 py-3', kpiToneClasses[kpi.tone])}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
              {kpi.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ── Fila de pendências ── */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Fila central de pendências
            </p>
            <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
              O que exige ação agora
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUEUE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQueueFilter(filter.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                  queueFilter === filter.id
                    ? 'border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]'
                    : 'border-[var(--ds-color-border-subtle)] text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)]/35',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
          </div>
        ) : filteredPendingQueueItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
            <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">
              Nenhuma pendência encontrada para o filtro atual.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--ds-color-border-subtle)]">
            {filteredPendingQueueItems.map((item) => {
              const ItemIcon = resolveQueueModuleIcon(item.module);
              return (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      resolveQueuePriorityClasses(item.priority),
                    )}
                  />
                  <ItemIcon className="h-4 w-4 shrink-0 text-[var(--ds-color-text-muted)]" />
                  <span className="shrink-0 rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                    {item.module}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--ds-color-text-muted)]">
                      {[item.responsible, item.site, `Prazo: ${formatDateOnly(item.dueDate)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[color:var(--ds-color-primary-subtle)]"
                    >
                      Abrir
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    {canUseAi ? (
                      <Link
                        href={buildPendingQueueSophieHref(item)}
                        title="Acionar agente SST"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)] transition-colors hover:brightness-95"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Vencimentos críticos ── */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">
            Vencimentos críticos
          </h2>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={expiredEpisCount > 0 ? 'danger' : 'warning'}>
              {expiredEpisCount} EPI{expiredEpisCount === 1 ? '' : 's'} vencido{expiredEpisCount === 1 ? '' : 's'}
            </StatusPill>
            <StatusPill tone={expiredTrainingsCount > 0 ? 'danger' : 'warning'}>
              {expiredTrainingsCount} treinamento{expiredTrainingsCount === 1 ? '' : 's'} vencido{expiredTrainingsCount === 1 ? '' : 's'}
            </StatusPill>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* EPIs */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <AlertCircle className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                EPIs
              </h3>
              <Link href="/dashboard/epis" className="ds-section-link text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">Ver todos</Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringEpis.length > 0 ? (
              <div className="space-y-2">
                {expiringEpis.slice(0, 5).map((epi) => {
                  const isExpired = isBefore(new Date(epi.validade_ca || ''), new Date());
                  return (
                    <div key={epi.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`} />
                        <div>
                          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{epi.nome}</p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">CA: {epi.ca}</p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? 'danger' : 'warning'}>
                        {isExpired ? 'Vencido' : `Vence ${format(new Date(epi.validade_ca || ''), 'dd/MM/yyyy')}`}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">Todos os EPIs estão com CA em dia.</p>
              </div>
            )}
          </div>

          {/* Treinamentos */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <GraduationCap className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                Treinamentos
              </h3>
              <Link href="/dashboard/trainings" className="ds-section-link text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">Ver todos</Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringTrainings.length > 0 ? (
              <div className="space-y-2">
                {expiringTrainings.slice(0, 5).map((training) => {
                  const isExpired = isBefore(new Date(training.data_vencimento), new Date());
                  return (
                    <div key={training.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`} />
                        <div>
                          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{training.nome}</p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">{training.user?.nome || 'Colaborador'}</p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? 'danger' : 'warning'}>
                        {isExpired ? 'Vencido' : `Vence ${format(new Date(training.data_vencimento), 'dd/MM/yyyy')}`}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
                <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">Todos os treinamentos estão em dia.</p>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
