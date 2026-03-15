'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  type LucideIcon,
  Users,
  Building2,
  Shield,
  FileText,
  ClipboardCheck,
  PlusCircle,
  TrendingUp,
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
import { aiService } from '@/services/aiService';
import { useAuth } from '@/context/AuthContext';
import type { User } from '@/services/usersService';
import { format, isBefore } from 'date-fns';
import { GandraInsights } from '@/components/GandraInsights';
import { StatusPill } from '@/components/ui/status-pill';
import { isAiEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CHART_TOKENS = {
  primary: 'var(--ds-color-action-primary)',
  accent: 'var(--ds-color-accent)',
  success: 'var(--ds-color-success)',
  warning: 'var(--ds-color-warning)',
  danger: 'var(--ds-color-danger)',
  info: 'var(--ds-color-info)',
  grid: 'rgba(99, 116, 139, 0.18)',
  axis: 'var(--ds-color-text-muted)',
};

type DashboardPersona =
  | 'admin-geral'
  | 'admin-empresa'
  | 'tst'
  | 'supervisor'
  | 'operacional';

type QueueFilter = 'all' | 'critical' | 'documents' | 'health' | 'actions';

type DashboardAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
  requiresAi?: boolean;
};

type PersonaGuide = {
  badge: string;
  title: string;
  quickActions: DashboardAction[];
};

const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'all', label: 'Tudo' },
  { id: 'critical', label: 'Críticas' },
  { id: 'documents', label: 'Documentos' },
  { id: 'health', label: 'Saúde ocupacional' },
  { id: 'actions', label: 'Ações' },
];

const PERSONA_GUIDES: Record<DashboardPersona, PersonaGuide> = {
  'admin-geral': {
    badge: 'visão multiempresa',
    title: 'Governança SST multiempresa com leitura rápida de pendências e documentos.',
    quickActions: [
      { label: 'Empresas', href: '/dashboard/companies', icon: Building2, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Usuários', href: '/dashboard/users', icon: Users, color: 'bg-[var(--ds-color-info)] hover:bg-[var(--ds-color-info-hover)]' },
      { label: 'Relatórios GST', href: '/dashboard/reports', icon: FileStack, color: 'bg-[var(--ds-color-accent)] hover:bg-[var(--ds-color-accent-hover)]' },
      { label: 'Documentos assistidos', href: '/dashboard/documentos/novo', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]', requiresAi: true },
    ],
  },
  'admin-empresa': {
    badge: 'operação da empresa',
    title: 'Gestão SST da empresa com visão clara de equipe, documentos e conformidade.',
    quickActions: [
      { label: 'Nova APR', href: '/dashboard/aprs/new', icon: PlusCircle, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Nova PT', href: '/dashboard/pts/new', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Novo Checklist', href: '/dashboard/checklists/new', icon: ClipboardCheck, color: 'bg-[var(--ds-color-accent)] hover:bg-[var(--ds-color-accent-hover)]' },
      { label: 'Documentos assistidos', href: '/dashboard/documentos/novo', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]', requiresAi: true },
    ],
  },
  tst: {
    badge: 'rotina de campo',
    title: 'Campo, bloqueios e liberações com resposta rápida para o TST.',
    quickActions: [
      { label: 'TST em Campo', href: '/dashboard/tst', icon: Shield, color: 'bg-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-hover)]' },
      { label: 'Nova APR', href: '/dashboard/aprs/new', icon: PlusCircle, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Nova PT', href: '/dashboard/pts/new', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Novo Checklist', href: '/dashboard/checklists/new', icon: ClipboardCheck, color: 'bg-[var(--ds-color-accent)] hover:bg-[var(--ds-color-accent-hover)]' },
      { label: 'Documentos assistidos', href: '/dashboard/documentos/novo', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]', requiresAi: true },
    ],
  },
  supervisor: {
    badge: 'execução supervisionada',
    title: 'Execução segura com visão rápida de permissões, riscos e desvios.',
    quickActions: [
      { label: 'Nova PT', href: '/dashboard/pts/new', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Novo Checklist', href: '/dashboard/checklists/new', icon: ClipboardCheck, color: 'bg-[var(--ds-color-accent)] hover:bg-[var(--ds-color-accent-hover)]' },
      { label: 'Nova NC', href: '/dashboard/nonconformities/new', icon: AlertTriangle, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]' },
      { label: 'DDS', href: '/dashboard/dds/new', icon: MessageSquare, color: 'bg-[var(--ds-color-info)] hover:bg-[var(--ds-color-info-hover)]' },
    ],
  },
  operacional: {
    badge: 'rotina operacional',
    title: 'Documentos, treinamentos e ações do dia organizados para execução segura.',
    quickActions: [
      { label: 'Nova APR', href: '/dashboard/aprs/new', icon: PlusCircle, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Nova PT', href: '/dashboard/pts/new', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Novo DDS', href: '/dashboard/dds/new', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]' },
      { label: 'Treinamentos', href: '/dashboard/trainings', icon: GraduationCap, color: 'bg-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-hover)]' },
    ],
  },
};

function resolveDashboardPersona(user: User | null, roles: string[]): DashboardPersona {
  const parts = [user?.profile?.nome, user?.role, user?.funcao, ...roles]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (parts.includes('administrador geral')) return 'admin-geral';
  if (parts.includes('técnico de segurança') || parts.includes('tecnico de seguranca') || parts.includes('tst')) return 'tst';
  if (parts.includes('administrador da empresa') || parts.includes('admin_empresa')) return 'admin-empresa';
  if (parts.includes('supervisor') || parts.includes('encarregado')) return 'supervisor';
  return 'operacional';
}

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

function resolvePendingQueueSophieLabel(item: PendingQueueEntry) {
  if (item.module === 'NC') return 'Revisar com SOPHIE';
  if (item.module === 'Ação') return 'Montar plano com SOPHIE';
  if (item.category === 'health') return 'Avaliar risco com SOPHIE';
  return 'Acionar SOPHIE';
}

export default function DashboardPage() {
  const { user, roles, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [safetyScore, setSafetyScore] = useState(100);
  const [expiringEpis, setExpiringEpis] = useState<DashboardSummaryResponse['expiringEpis']>([]);
  const [expiringTrainings, setExpiringTrainings] = useState<DashboardSummaryResponse['expiringTrainings']>([]);
  const [actionPlanItems, setActionPlanItems] = useState<DashboardSummaryResponse['actionPlanItems']>([]);
  const [siteCompliance, setSiteCompliance] = useState<DashboardSummaryResponse['siteCompliance']>([]);
  const [ncMonthlyData, setNcMonthlyData] = useState<{ mes: string; total: number }[]>([]);
  const [pendingQueue, setPendingQueue] = useState<DashboardPendingQueueResponse>({
    summary: { total: 0, critical: 0, high: 0, medium: 0, documents: 0, health: 0, actions: 0 },
    items: [],
  });
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

  const canUseAi = hasPermission('can_use_ai');
  const dashboardPersona = useMemo(() => resolveDashboardPersona(user, roles), [roles, user]);
  const personaGuide = PERSONA_GUIDES[dashboardPersona];

  const quickActions = useMemo(
    () => [
      {
        label: 'Novo Documento',
        href: '/dashboard/documentos/novo',
        icon: FileStack,
        color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]',
      },
      ...personaGuide.quickActions.filter((action) => !action.requiresAi || canUseAi),
    ],
    [canUseAi, personaGuide.quickActions],
  );

  const filteredPendingQueueItems = useMemo(() => {
    if (queueFilter === 'all') return pendingQueue.items.slice(0, 10);
    if (queueFilter === 'critical') return pendingQueue.items.filter((item) => item.priority === 'critical').slice(0, 10);
    return pendingQueue.items.filter((item) => item.category === queueFilter).slice(0, 10);
  }, [pendingQueue.items, queueFilter]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const aiInsightsPromise = isAiEnabled() ? aiService.getInsights() : Promise.resolve(null);

        const [summaryR, aiInsightsR, monthlyR, pendingQueueR] = await Promise.allSettled([
          dashboardService.getSummary(),
          aiInsightsPromise,
          nonConformitiesService.getMonthlyAnalytics(),
          dashboardService.getPendingQueue(),
        ]);

        if (summaryR.status === 'fulfilled') {
          const summary = summaryR.value;
          setExpiringEpis(summary.expiringEpis);
          setExpiringTrainings(summary.expiringTrainings);
          setActionPlanItems(summary.actionPlanItems);
          setSiteCompliance(summary.siteCompliance);
        }

        if (aiInsightsR.status === 'fulfilled' && aiInsightsR.value?.safetyScore !== undefined) {
          setSafetyScore(aiInsightsR.value.safetyScore);
        }

        if (monthlyR.status === 'fulfilled') {
          setNcMonthlyData(monthlyR.value.map((row) => ({ mes: row.mes.slice(0, 7), total: row.total })));
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
  const averageSiteCompliance = siteCompliance.length
    ? Math.round(siteCompliance.reduce((acc, site) => acc + site.taxa, 0) / siteCompliance.length)
    : 0;
  const topSiteCompliance = [...siteCompliance].sort((a, b) => b.taxa - a.taxa).slice(0, 3);

  const kpis = [
    {
      label: 'Pendências críticas',
      value: loading ? '—' : pendingQueue.summary.critical.toString(),
      tone: pendingQueue.summary.critical > 0 ? 'danger' : 'success',
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
    {
      label: 'Compliance',
      value: loading ? '—' : `${safetyScore}%`,
      tone: safetyScore > 80 ? 'success' : safetyScore > 50 ? 'warning' : 'danger',
    },
  ] as const;

  const kpiToneClasses: Record<string, string> = {
    danger: 'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]',
    warning: 'border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
    success: 'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 text-[var(--ds-color-success)]',
  };

  return (
    <div className="ds-dashboard-shell">
      {/* ── Zone 1: Hero + KPIs + Quick actions ── */}
      <div className="ds-dashboard-panel ds-hero-panel p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          {/* Hero text */}
          <div>
            <div className="mb-2 inline-flex items-center rounded-md border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              {personaGuide.badge}
            </div>
            <h1 className="max-w-xl text-xl font-bold tracking-[-0.02em] text-[var(--ds-color-text-primary)] lg:text-2xl">
              {personaGuide.title}
            </h1>
          </div>

          {/* 4-KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[38rem]">
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
        </div>

        {/* Quick actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              href={action.href}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3.5 py-2.5 text-[13px] font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/30 hover:bg-[var(--ds-color-surface-muted)]"
            >
              <action.icon className="h-4 w-4" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Zone 2: Pending queue + Action plan ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* Pending queue — flat rows */}
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

          {filteredPendingQueueItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-5 text-sm text-[var(--ds-color-text-secondary)]">
              Nenhuma pendência encontrada para o filtro atual.
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
                          title={resolvePendingQueueSophieLabel(item)}
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

        {/* Action plan — compact */}
        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Plano de ação</h2>
            <Link
              href="/dashboard/inspections"
              className="text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
            >
              Ver ações
            </Link>
          </div>
          {actionPlanItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm text-[var(--ds-color-text-muted)]">Nenhuma ação pendente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionPlanItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col rounded-xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-3 transition-colors hover:border-[color:var(--ds-color-warning-border)] hover:bg-[color:var(--ds-color-warning-subtle)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-[var(--ds-color-text-primary)]">{item.source}</span>
                    <span className="shrink-0 text-xs text-[var(--ds-color-text-disabled)]">
                      {item.prazo ? format(new Date(item.prazo), 'dd/MM/yyyy') : 'Sem prazo'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">{item.action}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-[var(--ds-color-text-muted)]">
                    <span>{item.responsavel || '—'}</span>
                    <span>{item.status || ''}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Zone 3: EPIs + Trainings ── */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              vencimentos críticos
            </p>
            <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">EPIs e treinamentos que pedem ação</h2>
          </div>
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
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <AlertCircle className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                EPIs
              </h3>
              <Link href="/dashboard/epis" className="ds-section-link">Ver todos</Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringEpis.length > 0 ? (
              <div className="space-y-2">
                {expiringEpis.slice(0, 4).map((epi) => {
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

          {/* Trainings */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center text-sm font-bold text-[var(--ds-color-text-primary)]">
                <GraduationCap className="mr-2 h-4 w-4 text-[var(--ds-color-warning)]" />
                Treinamentos
              </h3>
              <Link href="/dashboard/trainings" className="ds-section-link">Ver todos</Link>
            </div>
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent" />
              </div>
            ) : expiringTrainings.length > 0 ? (
              <div className="space-y-2">
                {expiringTrainings.slice(0, 4).map((training) => {
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

      {/* ── Zone 3: GandraInsights ── */}
      <GandraInsights />

      {/* ── Zone 3: Indicadores SST ── */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
            <TrendingUp className="mr-2 h-5 w-5 text-[var(--ds-color-action-primary)]" />
            Indicadores SST
          </h2>
          <StatusPill tone={averageSiteCompliance >= 80 ? 'success' : averageSiteCompliance >= 60 ? 'warning' : 'danger'}>
            Média das obras: {averageSiteCompliance}%
          </StatusPill>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr_0.8fr]">
          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--ds-color-text-secondary)]">Conformidade por Obra (%)</p>
            <ResponsiveContainer width="100%" height={168}>
              <BarChart data={siteCompliance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.grid} />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Conformidade']} />
                <Bar dataKey="taxa" fill={CHART_TOKENS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--ds-color-text-secondary)]">Não Conformidades (últimos 12 meses)</p>
            <ResponsiveContainer width="100%" height={168}>
              <LineChart data={ncMonthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.grid} />
                <XAxis dataKey="mes" tick={{ fontSize: 9, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke={CHART_TOKENS.danger} strokeWidth={2} dot={{ r: 3 }} name="NCs" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
              Síntese executiva
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">Média de conformidade</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{averageSiteCompliance}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">NCs no mês atual</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{ncMonthlyData.at(-1)?.total ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">Treinamentos críticos</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{expiredTrainingsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">EPIs críticos</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{expiredEpisCount}</span>
              </div>
            </div>
            {topSiteCompliance.length > 0 ? (
              <div className="mt-4 border-t border-[var(--ds-color-border-subtle)] pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                  Obras com melhor leitura
                </p>
                <div className="mt-3 space-y-2">
                  {topSiteCompliance.map((site) => (
                    <div
                      key={site.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{site.nome}</p>
                        <p className="text-xs text-[var(--ds-color-text-muted)]">
                          {site.conformes} conformes de {site.total}
                        </p>
                      </div>
                      <StatusPill tone={site.taxa >= 80 ? 'success' : site.taxa >= 60 ? 'warning' : 'danger'}>
                        {site.taxa}%
                      </StatusPill>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
