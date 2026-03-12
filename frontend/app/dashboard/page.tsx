'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Building2, 
  Shield, 
  FileText, 
  MapPin, 
  ClipboardCheck, 
  PlusCircle, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  GraduationCap,
  AlertTriangle,
  CalendarDays,
  FileStack,
  Clock3,
  ArrowUpRight,
  MessageSquare,
} from 'lucide-react';
import { dashboardService, DashboardSummaryResponse } from '@/services/dashboardService';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { trainingsService } from '@/services/trainingsService';
import { aiService } from '@/services/aiService';
import { format, isBefore } from 'date-fns';
import { GandraInsights } from '@/components/GandraInsights';
import { isAiEnabled } from '@/lib/featureFlags';
import {
  BarChart,
  Bar,
  Cell,
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [safetyScore, setSafetyScore] = useState(100);
  const [counts, setCounts] = useState({
    users: 0,
    companies: 0,
    sites: 0,
    checklists: 0,
    aprs: 0,
    pts: 0,
  });
  const [expiringEpis, setExpiringEpis] = useState<DashboardSummaryResponse['expiringEpis']>([]);
  const [expiringTrainings, setExpiringTrainings] = useState<DashboardSummaryResponse['expiringTrainings']>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DashboardSummaryResponse['pendingApprovals']>({
    aprs: 0,
    pts: 0,
    checklists: 0,
    nonconformities: 0,
  });
  const [actionPlanItems, setActionPlanItems] = useState<DashboardSummaryResponse['actionPlanItems']>([]);
  const [riskSummary, setRiskSummary] = useState<DashboardSummaryResponse['riskSummary']>({
    alto: 0,
    medio: 0,
    baixo: 0,
  });
  const [evidenceSummary, setEvidenceSummary] = useState<DashboardSummaryResponse['evidenceSummary']>({
    total: 0,
    inspections: 0,
    nonconformities: 0,
    audits: 0,
  });
  const [modelCounts, setModelCounts] = useState<DashboardSummaryResponse['modelCounts']>({
    aprs: 0,
    dds: 0,
    checklists: 0,
  });
  const [recentActivities, setRecentActivities] = useState<DashboardSummaryResponse['recentActivities']>([]);
  const [siteCompliance, setSiteCompliance] = useState<DashboardSummaryResponse['siteCompliance']>([]);
  const [recentReports, setRecentReports] = useState<DashboardSummaryResponse['recentReports']>([]);
  const [ncMonthlyData, setNcMonthlyData] = useState<{ mes: string; total: number }[]>([]);
  const [trainingSummaryData, setTrainingSummaryData] = useState<{ name: string; value: number; fill: string }[]>([]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const aiInsightsPromise = isAiEnabled() ? aiService.getInsights() : Promise.resolve(null);

        const [summaryR, aiInsightsR, monthlyR, expSummaryR] = await Promise.allSettled([
          dashboardService.getSummary(),
          aiInsightsPromise,
          nonConformitiesService.getMonthlyAnalytics(),
          trainingsService.getExpirySummary(),
        ]);

        if (summaryR.status === 'fulfilled') {
          const summary = summaryR.value;
          setCounts(summary.counts);
          setExpiringEpis(summary.expiringEpis);
          setExpiringTrainings(summary.expiringTrainings);
          setPendingApprovals(summary.pendingApprovals);
          setActionPlanItems(summary.actionPlanItems);
          setRiskSummary(summary.riskSummary);
          setEvidenceSummary(summary.evidenceSummary);
          setModelCounts(summary.modelCounts);
          setRecentActivities(summary.recentActivities);
          setSiteCompliance(summary.siteCompliance);
          setRecentReports(summary.recentReports);
        }

        if (aiInsightsR.status === 'fulfilled' && aiInsightsR.value?.safetyScore !== undefined) {
          setSafetyScore(aiInsightsR.value.safetyScore);
        }

        if (monthlyR.status === 'fulfilled') {
          setNcMonthlyData(
            monthlyR.value.map((row) => ({
              mes: row.mes.slice(0, 7),
              total: row.total,
            })),
          );
        }

        if (expSummaryR.status === 'fulfilled') {
          const summary = expSummaryR.value;
          setTrainingSummaryData([
            { name: 'Em dia', value: summary.valid, fill: CHART_TOKENS.success },
            { name: 'Vencendo', value: summary.expiringSoon, fill: CHART_TOKENS.warning },
            { name: 'Vencidos', value: summary.expired, fill: CHART_TOKENS.danger },
          ]);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const stats = [
    { label: 'Usuários Ativos', value: loading ? '...' : counts.users.toString(), icon: Users, tone: 'ds-kpi-card--primary' },
    { label: 'Empresas', value: loading ? '...' : counts.companies.toString(), icon: Building2, tone: 'ds-kpi-card--success' },
    { label: 'Obras/Setores', value: loading ? '...' : counts.sites.toString(), icon: MapPin, tone: 'ds-kpi-card--warning' },
    { label: 'Checklists', value: loading ? '...' : counts.checklists.toString(), icon: ClipboardCheck, tone: 'ds-kpi-card--accent' },
    { label: 'APRs Geradas', value: loading ? '...' : counts.aprs.toString(), icon: Shield, tone: 'ds-kpi-card--primary' },
    { label: 'Permissões (PT)', value: loading ? '...' : counts.pts.toString(), icon: FileText, tone: 'ds-kpi-card--accent' },
  ];

  const quickActions = [
    { label: 'Nova APR', href: '/dashboard/aprs', icon: PlusCircle, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
    { label: 'Nova PT', href: '/dashboard/pts', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
    { label: 'Novo Checklist', href: '/dashboard/checklists', icon: ClipboardCheck, color: 'bg-[var(--ds-color-accent)] hover:bg-[var(--ds-color-accent-hover)]' },
    { label: 'Novo EPI', href: '/dashboard/epis', icon: Shield, color: 'bg-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-hover)]' },
    { label: 'Nova NC', href: '/dashboard/nonconformities/new', icon: AlertTriangle, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]' },
    { label: 'Novo DDS', href: '/dashboard/dds', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]' },
  ];

  const operationalHighlights = [
    {
      label: 'Pendências críticas',
      value: pendingApprovals.aprs + pendingApprovals.pts + pendingApprovals.nonconformities,
      hint: 'Itens que exigem atuação hoje',
      icon: AlertTriangle,
      tone: 'text-[var(--ds-color-warning)]',
    },
    {
      label: 'Documentos ativos',
      value: counts.aprs + counts.pts + counts.checklists,
      hint: 'APR, PT e checklist emitidos',
      icon: FileStack,
      tone: 'text-[var(--ds-color-info)]',
    },
    {
      label: 'Atualizado em',
      value: format(new Date(), 'dd/MM'),
      hint: 'Painel sincronizado',
      icon: CalendarDays,
      tone: 'text-[var(--ds-color-success)]',
    },
  ];

  return (
    <div className="ds-dashboard-shell">
      <div className="ds-dashboard-panel ds-hero-panel overflow-hidden p-5 lg:p-6">
        <div className="relative z-[1] flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2.5 inline-flex items-center rounded-full border border-[color:var(--ds-color-border-strong)]/70 bg-[color:var(--ds-color-surface-muted)]/55 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              cockpit operacional
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ds-color-text-primary)] lg:text-[2rem]">Gestão SST com visão executiva e resposta rápida.</h1>
            <p className="mt-2.5 max-w-2xl text-[13px] text-[var(--ds-color-text-secondary)]">
              Visão executiva com conformidade, documentação crítica, treinamentos e ações prioritárias em um único painel.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <div className="ds-topbar-chip">
                <Clock3 className="h-4 w-4 text-[var(--ds-color-info)]" />
                Acompanhamento em tempo real
              </div>
              <div className="ds-topbar-chip">
                <Shield className="h-4 w-4 text-[var(--ds-color-success)]" />
                Multiempresa seguro
              </div>
              <div className="ds-topbar-chip">
                <FileText className="h-4 w-4 text-[var(--ds-color-warning)]" />
                Documentos com rastreabilidade
              </div>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3 xl:min-w-[25rem]">
            {operationalHighlights.map((item) => (
              <div key={item.label} className="ds-stat-tile">
                <div className="flex items-center justify-between">
                  <item.icon className={`h-4 w-4 ${item.tone}`} />
                  <ArrowUpRight className="h-4 w-4 text-[var(--ds-color-text-disabled)]" />
                </div>
                <p className="mt-5 text-[1.45rem] font-bold text-[var(--ds-color-text-primary)]">{item.value}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                  {item.label}
                </p>
                <p className="mt-1.5 text-[11px] text-[var(--ds-color-text-muted)]">{item.hint}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-[1] mt-5 flex flex-wrap gap-2.5">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              href={action.href}
              className={`${action.color} flex items-center space-x-2 rounded-xl border border-white/10 px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_16px_32px_rgba(15,23,42,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_20px_36px_rgba(15,23,42,0.3)]`}
            >
              <action.icon className="h-4 w-4" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card de Score de Segurança */}
        <div className="ds-dashboard-panel flex flex-col items-center justify-center p-5 text-center">
          <div className="mb-3 flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-[var(--ds-color-action-primary)]" />
            <h3 className="text-base font-bold text-[var(--ds-color-text-primary)]">Compliance SST</h3>
          </div>
          
          <div className="relative mb-3 h-28 w-28">
            <svg className="h-full w-full" viewBox="0 0 36 36">
              <path
                className="fill-none"
                stroke="var(--ds-color-border-default)"
                strokeWidth="3"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="fill-none transition-all duration-1000 ease-out"
                stroke={safetyScore > 80 ? 'var(--ds-color-success)' : safetyScore > 50 ? 'var(--ds-color-warning)' : 'var(--ds-color-danger)'}
                strokeWidth="3"
                strokeDasharray={`${safetyScore}, 100`}
                strokeLinecap="round"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-[var(--ds-color-text-primary)]">{safetyScore}%</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--ds-color-text-muted)]">Score</span>
            </div>
          </div>
          
          <p className="px-3 text-sm text-[var(--ds-color-text-secondary)]">
            {safetyScore > 80 
              ? 'Sua empresa está com um excelente nível de conformidade.' 
              : safetyScore > 50 
                ? 'Existem pendências importantes que precisam de atenção.' 
                : 'Atenção crítica: Nível de conformidade abaixo do recomendado.'}
          </p>
        </div>

        {/* Gandra Insights (Colspan 2) */}
        <div className="lg:col-span-2">
          <GandraInsights />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, index) => (
          <div key={index} className="ds-dashboard-panel ds-dashboard-stat p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-lg)]">
            <div className="flex items-center justify-between">
              <div className={`ds-kpi-card ${stat.tone} rounded-xl p-2.5`}>
                <stat.icon className="h-5 w-5 text-current" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xl font-bold text-[var(--ds-color-text-primary)]">{stat.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ds-color-text-muted)]">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ds-dashboard-panel p-5">
          <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
            <AlertTriangle className="mr-2 h-5 w-5 text-[var(--ds-color-warning)]" />
            Pendências de Aprovação
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">APRs pendentes</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.aprs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">PTs pendentes</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.pts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">Checklists pendentes</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.checklists}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">NCs em aberto</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.nonconformities}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="ds-badge ds-badge--primary">APRs</Link>
            <Link href="/dashboard/pts" className="ds-badge ds-badge--accent">PTs</Link>
            <Link href="/dashboard/checklists" className="ds-badge ds-badge--info">Checklists</Link>
            <Link href="/dashboard/nonconformities" className="ds-badge ds-badge--warning">NCs</Link>
          </div>
        </div>

        <div className="ds-dashboard-panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Plano de Ação Prioritário</h2>
            <Link href="/dashboard/inspections" className="text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">
              Ver ações
            </Link>
          </div>
          {actionPlanItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm text-[var(--ds-color-text-muted)] font-medium">Nenhuma ação pendente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionPlanItems.map((item) => (
                <Link key={item.id} href={item.href} className="flex flex-col rounded-lg border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] p-2.5 hover:border-[color:var(--ds-color-warning-border)] hover:bg-[color:var(--ds-color-warning-subtle)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--ds-color-text-primary)]">{item.source}</span>
                    <span className="text-xs text-[var(--ds-color-text-disabled)]">{item.prazo ? format(new Date(item.prazo), 'dd/MM/yyyy') : 'Sem prazo'}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">{item.action}</p>
                  <p className="text-xs text-[var(--ds-color-text-muted)]">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--ds-color-text-muted)]">
                    <span>{item.responsavel || 'Responsável não definido'}</span>
                    <span>{item.status || 'Status não informado'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Matriz de Risco</h2>
            <Link href="/dashboard/risks" className="text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">
              Ver riscos
            </Link>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-[var(--ds-color-danger-subtle)] border border-[var(--ds-color-danger-border)] px-3.5 py-2.5">
              <span className="text-sm font-semibold text-[var(--ds-color-danger)]">Alto</span>
              <span className="text-lg font-bold text-[var(--ds-color-danger)]">{riskSummary.alto}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--ds-color-warning-subtle)] border border-[var(--ds-color-warning-border)] px-3.5 py-2.5">
              <span className="text-sm font-semibold text-[var(--ds-color-warning)]">Médio</span>
              <span className="text-lg font-bold text-[var(--ds-color-warning)]">{riskSummary.medio}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--ds-color-success-subtle)] border border-[var(--ds-color-success-border)] px-3.5 py-2.5">
              <span className="text-sm font-semibold text-[var(--ds-color-success)]">Baixo</span>
              <span className="text-lg font-bold text-[var(--ds-color-success)]">{riskSummary.baixo}</span>
            </div>
          </div>
        </div>

        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Evidências Registradas</h2>
            <Link href="/dashboard/inspections" className="ds-section-link">
              Ver evidências
            </Link>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-[color:var(--ds-color-surface-muted)]/18 px-3.5 py-3.5">
            <div>
              <p className="text-sm text-[var(--ds-color-text-muted)]">Total</p>
              <p className="text-2xl font-bold text-[var(--ds-color-text-primary)]">{evidenceSummary.total}</p>
            </div>
            <div className="space-y-1 text-right text-xs text-[var(--ds-color-text-muted)]">
              <p>Inspeções: {evidenceSummary.inspections}</p>
              <p>Auditorias: {evidenceSummary.audits}</p>
              <p>NCs: {evidenceSummary.nonconformities}</p>
            </div>
          </div>
        </div>

        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Biblioteca de Modelos</h2>
            <Link href="/dashboard/checklist-models" className="ds-section-link">
              Ver modelos
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">Modelos de APR</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{modelCounts.aprs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">Modelos de DDS</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{modelCounts.dds}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ds-color-text-secondary)]">Modelos de Checklist</span>
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{modelCounts.checklists}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="ds-badge ds-badge--primary">APRs</Link>
            <Link href="/dashboard/dds" className="ds-badge ds-badge--accent">DDS</Link>
            <Link href="/dashboard/checklist-models" className="ds-badge ds-badge--info">Checklists</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
              <AlertCircle className="mr-2 h-5 w-5 text-[var(--ds-color-warning)]" />
              EPIs Vencidos ou Próximos do Vencimento
            </h2>
            <Link href="/dashboard/epis" className="ds-section-link">
              Ver todos
            </Link>
          </div>
          
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent"></div>
            </div>
          ) : expiringEpis.length > 0 ? (
            <div className="space-y-4">
              {expiringEpis.map((epi) => {
                const isExpired = isBefore(new Date(epi.validade_ca || ''), new Date());
                return (
                <div key={epi.id} className="flex items-center justify-between rounded-lg bg-[color:var(--ds-color-surface-muted)]/18 p-2.5">
                  <div className="flex items-center space-x-3">
                    <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`}></div>
                    <div>
                      <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{epi.nome}</p>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">CA: {epi.ca} | {epi.nome}</p>
                    </div>
                  </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${isExpired ? 'text-[var(--ds-color-danger)]' : 'text-[var(--ds-color-warning)]'}`}>
                        {isExpired ? 'VENCIDO' : `Vence em ${format(new Date(epi.validade_ca || ''), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Todos os EPIs estão com CA em dia.</p>
            </div>
          )}
        </div>

        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
              <GraduationCap className="mr-2 h-5 w-5 text-[var(--ds-color-warning)]" />
              Treinamentos Vencidos ou Próximos do Vencimento
            </h2>
            <Link href="/dashboard/trainings" className="ds-section-link">
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent"></div>
            </div>
          ) : expiringTrainings.length > 0 ? (
            <div className="space-y-4">
              {expiringTrainings.map((training) => {
                const isExpired = isBefore(new Date(training.data_vencimento), new Date());
                return (
                <div key={training.id} className="flex items-center justify-between rounded-lg bg-[color:var(--ds-color-surface-muted)]/18 p-2.5">
                  <div className="flex items-center space-x-3">
                    <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`}></div>
                    <div>
                      <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{training.nome}</p>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">{training.user?.nome || 'Colaborador'}</p>
                    </div>
                  </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${isExpired ? 'text-[var(--ds-color-danger)]' : 'text-[var(--ds-color-warning)]'}`}>
                        {isExpired ? 'VENCIDO' : `Vence em ${format(new Date(training.data_vencimento), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Todos os treinamentos estão em dia.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
              <MapPin className="mr-2 h-5 w-5 text-[var(--ds-color-action-primary)]" />
              Benchmark de Conformidade por Obra
            </h2>
            <Link href="/dashboard/checklists" className="ds-section-link">
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent"></div>
            </div>
          ) : siteCompliance.length > 0 ? (
            <div className="space-y-4">
              {siteCompliance.map((site) => (
                <div key={site.id} className="flex items-center justify-between rounded-lg bg-[color:var(--ds-color-surface-muted)]/18 p-2.5">
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 rounded-full bg-[var(--ds-color-action-primary)]"></div>
                    <div>
                      <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{site.nome}</p>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">{site.conformes} conformes de {site.total}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-[var(--ds-color-action-primary)]">{site.taxa}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Nenhum checklist registrado.</p>
            </div>
          )}
        </div>

        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Trilha de Auditoria</h2>
            <Link href="/dashboard/reports" className="ds-section-link">
              Ver relatórios
            </Link>
          </div>
          {recentActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Nenhuma atualização recente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <Link key={activity.id} href={activity.href} className="flex items-start space-x-3 rounded-lg p-2.5 hover:bg-[color:var(--ds-color-surface-muted)]/18">
                  <div className={`mt-1 h-2 w-2 rounded-full ${activity.color}`}></div>
                  <div>
                    <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{activity.title}</p>
                    <p className="text-xs text-[var(--ds-color-text-secondary)]">{activity.description}</p>
                    <p className="mt-1 text-[10px] font-medium text-[var(--ds-color-text-muted)]">{format(new Date(activity.date), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Relatórios Recentes</h2>
            <Link href="/dashboard/reports" className="ds-section-link">
              Ver relatórios
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Nenhum relatório gerado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <Link key={report.id} href="/dashboard/reports" className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-3.5 py-2.5 hover:border-[var(--ds-color-action-primary)]/35">
                  <div>
                    <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{report.titulo}</p>
                    <p className="text-xs text-[var(--ds-color-text-muted)]">{report.mes}/{report.ano}</p>
                  </div>
                  <span className="text-xs text-[var(--ds-color-text-muted)]">{format(new Date(report.created_at), 'dd/MM/yyyy')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="ds-dashboard-panel p-5">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Aprovação e Assinaturas</h2>
            <Link href="/dashboard/settings" className="ds-section-link">
              Configurar
            </Link>
          </div>
          <div className="space-y-3 text-sm text-[var(--ds-color-text-secondary)]">
            <p>Assinaturas digitais disponíveis nos módulos de APR, PT, Checklist, Treinamentos e Auditorias.</p>
            <p>Use o status de pendências para priorizar validações e fechamento de ações críticas.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="ds-badge ds-badge--primary">APRs</Link>
            <Link href="/dashboard/pts" className="ds-badge ds-badge--accent">PTs</Link>
            <Link href="/dashboard/checklists" className="ds-badge ds-badge--info">Checklists</Link>
            <Link href="/dashboard/trainings" className="ds-badge ds-badge--success">Treinamentos</Link>
          </div>
        </div>
      </div>

      {/* SST Indicators Section */}
      <div className="ds-dashboard-panel p-5">
        <h2 className="mb-5 flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
          <TrendingUp className="mr-2 h-5 w-5 text-[var(--ds-color-action-primary)]" />
          Indicadores SST
        </h2>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Chart 1: Conformidade por Obra */}
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

          {/* Chart 2: Evolução de NCs */}
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

          {/* Chart 3: Status de Treinamentos */}
          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--ds-color-text-secondary)]">Status de Treinamentos</p>
            <ResponsiveContainer width="100%" height={168}>
              <BarChart data={trainingSummaryData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_TOKENS.grid} />
                <XAxis type="number" tick={{ fontSize: 10, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: CHART_TOKENS.axis }} axisLine={false} tickLine={false} width={70} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Quantidade">
                  {trainingSummaryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
