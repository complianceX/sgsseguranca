'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  type LucideIcon,
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
  CheckCheck,
  Route,
  ClipboardList,
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
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
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

type ResumeItem = {
  id: string;
  label: string;
  title: string;
  description: string;
  href: string;
  meta: string;
  icon: LucideIcon;
  accentClass: string;
  kind: 'draft' | 'recent' | 'report';
  timestamp?: number;
};

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
  description: string;
  focusTitle: string;
  focusPoints: string[];
  heroChips: Array<{
    label: string;
    icon: LucideIcon;
    tone: string;
  }>;
  primaryAction: {
    label: string;
    href: string;
  };
  secondaryAction: {
    label: string;
    href: string;
  };
  quickActions: DashboardAction[];
};

const QUEUE_FILTERS: Array<{
  id: QueueFilter;
  label: string;
}> = [
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
    description:
      'Entre já no contexto executivo: escolha a empresa ativa, acompanhe aprovações críticas e mantenha rastreabilidade documental sem perder ritmo.',
    focusTitle: 'Seu foco hoje',
    focusPoints: [
      'Confirmar a empresa ativa antes de atuar em fluxos críticos.',
      'Priorizar aprovações, desvios e indicadores com impacto operacional.',
      'Manter relatórios, assinaturas e governança com visão consolidada.',
    ],
    heroChips: [
      { label: 'Governança institucional', icon: Shield, tone: 'text-[var(--ds-color-success)]' },
      { label: 'Rastreabilidade multiempresa', icon: Building2, tone: 'text-[var(--ds-color-info)]' },
      { label: 'Relatórios e auditoria', icon: FileStack, tone: 'text-[var(--ds-color-warning)]' },
    ],
    primaryAction: { label: 'Abrir gestão de empresas', href: '/dashboard/companies' },
    secondaryAction: { label: 'Ir para configurações', href: '/dashboard/settings' },
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
    description:
      'Use a entrada por perfil para acompanhar treinamentos, documentos e pendências operacionais sem precisar montar o contexto a cada acesso.',
    focusTitle: 'Seu foco hoje',
    focusPoints: [
      'Atuar nas pendências que travam operação e conformidade.',
      'Manter equipe, treinamentos e documentos críticos sempre em dia.',
      'Usar o chat da SOPHIE e os relatórios para acelerar decisões operacionais.',
    ],
    heroChips: [
      { label: 'Equipe e treinamentos', icon: Users, tone: 'text-[var(--ds-color-success)]' },
      { label: 'Conformidade operacional', icon: CheckCheck, tone: 'text-[var(--ds-color-info)]' },
      { label: 'Documentação rastreável', icon: FileText, tone: 'text-[var(--ds-color-warning)]' },
    ],
    primaryAction: { label: 'Abrir usuários e equipe', href: '/dashboard/users' },
    secondaryAction: { label: 'Ver treinamentos', href: '/dashboard/trainings' },
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
    description:
      'Você entra já no contexto operacional: consulta rápida, pendências do dia, documentos críticos e apoio do chat da SOPHIE para análise técnica.',
    focusTitle: 'Entrada recomendada',
    focusPoints: [
      'Usar o modo TST em Campo para bloqueios, documentos vencidos e fila do dia.',
      'Retomar APR, PT e checklist sem reconstruir o contexto manualmente.',
      'Acionar o chat da SOPHIE para orientar risco, imagem e documentação técnica.',
    ],
    heroChips: [
      { label: 'Pendências do dia', icon: Clock3, tone: 'text-[var(--ds-color-warning)]' },
      { label: 'Consulta rápida em campo', icon: Route, tone: 'text-[var(--ds-color-info)]' },
      { label: 'Chat da SOPHIE', icon: MessageSquare, tone: 'text-[var(--ds-color-success)]' },
    ],
    primaryAction: { label: 'Abrir TST em campo', href: '/dashboard/tst' },
    secondaryAction: { label: 'Montar documento assistido', href: '/dashboard/documentos/novo' },
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
    description:
      'O painel prioriza o que trava a frente de serviço: liberações, checklists, treinamentos e documentos que exigem ação do responsável.',
    focusTitle: 'Seu foco hoje',
    focusPoints: [
      'Remover bloqueios da operação com rapidez e evidência.',
      'Manter PT, checklist e desvios sob controle na obra ou setor.',
      'Direcionar times para documentos e treinamentos mais urgentes.',
    ],
    heroChips: [
      { label: 'Liberações operacionais', icon: FileText, tone: 'text-[var(--ds-color-info)]' },
      { label: 'Checklists ativos', icon: ClipboardList, tone: 'text-[var(--ds-color-success)]' },
      { label: 'Desvios priorizados', icon: AlertTriangle, tone: 'text-[var(--ds-color-warning)]' },
    ],
    primaryAction: { label: 'Abrir permissões de trabalho', href: '/dashboard/pts' },
    secondaryAction: { label: 'Ver checklists', href: '/dashboard/checklists' },
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
    description:
      'A entrada foi adaptada para reduzir navegação desnecessária e ajudar você a retomar o que estava em andamento com rapidez.',
    focusTitle: 'Seu foco hoje',
    focusPoints: [
      'Retomar documentos em rascunho sem perder informações já preenchidas.',
      'Consultar treinamentos e pendências que impactam a sua atuação.',
      'Manter documentação e evidências com clareza para revisão técnica.',
    ],
    heroChips: [
      { label: 'Retomada rápida', icon: Clock3, tone: 'text-[var(--ds-color-info)]' },
      { label: 'Documentos do dia', icon: FileText, tone: 'text-[var(--ds-color-success)]' },
      { label: 'Treinamentos e DDS', icon: GraduationCap, tone: 'text-[var(--ds-color-warning)]' },
    ],
    primaryAction: { label: 'Abrir APRs', href: '/dashboard/aprs' },
    secondaryAction: { label: 'Ver treinamentos', href: '/dashboard/trainings' },
    quickActions: [
      { label: 'Nova APR', href: '/dashboard/aprs/new', icon: PlusCircle, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Nova PT', href: '/dashboard/pts/new', icon: FileText, color: 'bg-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-action-primary-hover)]' },
      { label: 'Novo DDS', href: '/dashboard/dds/new', icon: MessageSquare, color: 'bg-[var(--ds-color-warning)] hover:bg-[var(--ds-color-warning-hover)]' },
      { label: 'Treinamentos', href: '/dashboard/trainings', icon: GraduationCap, color: 'bg-[var(--ds-color-success)] hover:bg-[var(--ds-color-success-hover)]' },
    ],
  },
};

const ACTIVITY_ROUTE_RESOLVERS: Record<string, (id: string) => string> = {
  apr: (id) => `/dashboard/aprs/edit/${id}`,
  pt: (id) => `/dashboard/pts/edit/${id}`,
  checklist: (id) => `/dashboard/checklists/edit/${id}`,
  inspection: (id) => `/dashboard/inspections/edit/${id}`,
  audit: (id) => `/dashboard/audits/edit/${id}`,
  nc: (id) => `/dashboard/nonconformities/edit/${id}`,
  training: (id) => `/dashboard/trainings/edit/${id}`,
  dds: (id) => `/dashboard/dds/edit/${id}`,
};

const ACTIVITY_LABELS: Record<string, string> = {
  apr: 'APR',
  pt: 'PT',
  checklist: 'Checklist',
  inspection: 'Relatório Fotográfico',
  audit: 'Auditoria',
  nc: 'NC',
  training: 'Treinamento',
  dds: 'DDS',
};

const RESUME_ACCENT_BY_KIND: Record<ResumeItem['kind'], string> = {
  draft: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
  recent: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
  report: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
};

function resolveDashboardToneClasses(tone: string) {
  switch (tone) {
    case 'ds-kpi-card--success':
      return 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]';
    case 'ds-kpi-card--warning':
      return 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]';
    case 'ds-kpi-card--accent':
      return 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]';
    default:
      return 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]';
  }
}

function resolveHeroChipTone(toneClass: string): StatusTone {
  if (toneClass.includes('warning')) return 'warning';
  if (toneClass.includes('success')) return 'success';
  return 'info';
}

function resolveDashboardPersona(user: User | null, roles: string[]): DashboardPersona {
  const parts = [user?.profile?.nome, user?.role, user?.funcao, ...roles]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (parts.includes('administrador geral')) {
    return 'admin-geral';
  }

  if (parts.includes('técnico de segurança') || parts.includes('tecnico de seguranca') || parts.includes('tst')) {
    return 'tst';
  }

  if (parts.includes('administrador da empresa') || parts.includes('admin_empresa')) {
    return 'admin-empresa';
  }

  if (parts.includes('supervisor') || parts.includes('encarregado')) {
    return 'supervisor';
  }

  return 'operacional';
}

function parseActivityReference(compoundId: string) {
  const separatorIndex = compoundId.indexOf('-');

  if (separatorIndex === -1) {
    return { prefix: '', itemId: compoundId };
  }

  return {
    prefix: compoundId.slice(0, separatorIndex),
    itemId: compoundId.slice(separatorIndex + 1),
  };
}

function resolveActivityHref(activity: DashboardSummaryResponse['recentActivities'][number]) {
  const { prefix, itemId } = parseActivityReference(activity.id);

  if (prefix && itemId && ACTIVITY_ROUTE_RESOLVERS[prefix]) {
    return ACTIVITY_ROUTE_RESOLVERS[prefix](itemId);
  }

  return activity.href;
}

function resolveActivityLabel(activityId: string) {
  const { prefix } = parseActivityReference(activityId);
  return ACTIVITY_LABELS[prefix] || 'Documento';
}

function resolveActivityIcon(activityId: string): LucideIcon {
  const { prefix } = parseActivityReference(activityId);

  switch (prefix) {
    case 'apr':
      return Shield;
    case 'pt':
      return FileText;
    case 'checklist':
      return ClipboardCheck;
    case 'inspection':
      return FileStack;
    case 'audit':
      return CheckCheck;
    case 'nc':
      return AlertTriangle;
    case 'training':
      return GraduationCap;
    case 'dds':
      return MessageSquare;
    default:
      return FileText;
  }
}

function safeReadStorageJson<T>(key: string | null): T | null {
  if (!key || typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function formatDateTime(value?: string | number | Date | null) {
  if (!value) {
    return 'Sem data';
  }

  const normalizedDate = new Date(value);

  if (Number.isNaN(normalizedDate.getTime())) {
    return 'Sem data';
  }

  return format(normalizedDate, 'dd/MM/yyyy HH:mm');
}

function formatDateOnly(value?: string | number | Date | null) {
  if (!value) {
    return 'Sem prazo';
  }

  const normalizedDate = new Date(value);

  if (Number.isNaN(normalizedDate.getTime())) {
    return 'Sem prazo';
  }

  return format(normalizedDate, 'dd/MM/yyyy');
}

function resolveQueuePriorityClasses(priority: 'critical' | 'high' | 'medium') {
  switch (priority) {
    case 'critical':
      return 'bg-[color:var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]';
    case 'high':
      return 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]';
    default:
      return 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]';
  }
}

function resolveQueueModuleIcon(module: string): LucideIcon {
  switch (module) {
    case 'APR':
      return Shield;
    case 'PT':
      return FileText;
    case 'Checklist':
      return ClipboardCheck;
    case 'NC':
      return AlertTriangle;
    case 'Treinamento':
      return GraduationCap;
    case 'ASO':
      return AlertCircle;
    case 'Ação':
      return CheckCheck;
    default:
      return FileStack;
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

  if (item.sourceId) {
    params.set('sourceId', item.sourceId);
  }

  if (item.siteId) {
    params.set('site_id', item.siteId);
  }

  if (item.site) {
    params.set('site_name', item.site);
  }

  if (item.responsible) {
    params.set('responsible', item.responsible);
  }

  if (item.dueDate) {
    params.set('dueDate', item.dueDate);
  }

  return `/dashboard/sst-agent?${params.toString()}`;
}

function resolvePendingQueueSophieLabel(item: PendingQueueEntry) {
  if (item.module === 'NC') {
    return 'Revisar com SOPHIE';
  }

  if (item.module === 'Ação') {
    return 'Montar plano com SOPHIE';
  }

  if (item.category === 'health') {
    return 'Avaliar risco com SOPHIE';
  }

  return 'Acionar SOPHIE';
}

export default function DashboardPage() {
  const { user, roles, hasPermission } = useAuth();
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
  const [resumeItems, setResumeItems] = useState<ResumeItem[]>([]);
  const [pendingQueue, setPendingQueue] = useState<DashboardPendingQueueResponse>({
    summary: {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      documents: 0,
      health: 0,
      actions: 0,
    },
    items: [],
  });
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

  const canUseAi = hasPermission('can_use_ai');
  const dashboardPersona = useMemo(
    () => resolveDashboardPersona(user, roles),
    [roles, user],
  );
  const personaGuide = PERSONA_GUIDES[dashboardPersona];
  const heroChips = useMemo(
    () =>
      personaGuide.heroChips.filter(
        (chip) => canUseAi || chip.label.toLowerCase().indexOf('sophie') === -1,
      ),
    [canUseAi, personaGuide.heroChips],
  );
  const secondaryEntryAction = useMemo(
    () =>
      !canUseAi && personaGuide.secondaryAction.href === '/dashboard/sst-agent'
        ? { label: 'Ver permissões de trabalho', href: '/dashboard/pts' }
        : personaGuide.secondaryAction,
    [canUseAi, personaGuide.secondaryAction],
  );
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
  const mappedRecentActivities = useMemo(
    () =>
      recentActivities.map((activity) => ({
        ...activity,
        href: resolveActivityHref(activity),
        moduleLabel: resolveActivityLabel(activity.id),
        icon: resolveActivityIcon(activity.id),
      })),
    [recentActivities],
  );
  const filteredPendingQueueItems = useMemo(() => {
    if (queueFilter === 'all') {
      return pendingQueue.items.slice(0, 8);
    }

    if (queueFilter === 'critical') {
      return pendingQueue.items
        .filter((item) => item.priority === 'critical')
        .slice(0, 8);
    }

    return pendingQueue.items
      .filter((item) => item.category === queueFilter)
      .slice(0, 8);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const nextItems: ResumeItem[] = [];
    const companyKey = user?.company_id || 'default';

    const aprDraft = safeReadStorageJson<{
      step?: number;
      values?: { titulo?: string; descricao?: string; site_id?: string };
    }>(
      `gst.apr.wizard.draft.${companyKey}`,
    ) || safeReadStorageJson<{
      step?: number;
      values?: { titulo?: string; descricao?: string; site_id?: string };
    }>(
      `compliancex.apr.wizard.draft.${companyKey}`,
    );

    if (aprDraft?.values) {
      nextItems.push({
        id: 'draft-apr',
        label: 'APR',
        title: aprDraft.values.titulo || 'APR em rascunho',
        description:
          aprDraft.values.descricao ||
          'Rascunho local disponível para continuar a análise sem reiniciar o formulário.',
        href: '/dashboard/aprs/new',
        meta: aprDraft.step ? `Etapa ${aprDraft.step} de 3 • Rascunho local` : 'Rascunho local',
        icon: Shield,
        accentClass: 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]',
        kind: 'draft',
      });
    }

    const ptDraft = safeReadStorageJson<{
      step?: number;
      values?: { titulo?: string; descricao?: string };
    }>(
      `gst.pt.wizard.draft.${companyKey}`,
    ) || safeReadStorageJson<{
      step?: number;
      values?: { titulo?: string; descricao?: string };
    }>(
      `compliancex.pt.wizard.draft.${companyKey}`,
    );

    if (ptDraft?.values) {
      nextItems.push({
        id: 'draft-pt',
        label: 'PT',
        title: ptDraft.values.titulo || 'PT em rascunho',
        description:
          ptDraft.values.descricao ||
          'Continue a permissão de trabalho do ponto em que você parou.',
        href: '/dashboard/pts/new',
        meta: ptDraft.step ? `Etapa ${ptDraft.step} de 3 • Rascunho local` : 'Rascunho local',
        icon: FileText,
        accentClass: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
        kind: 'draft',
      });
    }

    if (user?.id) {
      const checklistDrafts: ResumeItem[] = [];

      for (let index = 0; index < window.localStorage.length; index += 1) {
        const storageKey = window.localStorage.key(index);

        if (!storageKey || !storageKey.startsWith('checklist.form.draft.')) {
          continue;
        }

        if (!storageKey.includes(`.${user.id}.`)) {
          continue;
        }

        const parsedDraft = safeReadStorageJson<{
          savedAt?: number;
          checklistMode?: 'tool' | 'machine';
          values?: { titulo?: string; descricao?: string };
        }>(storageKey);

        if (!parsedDraft?.values) {
          continue;
        }

        const keyParts = storageKey.split('.');
        const templateId = keyParts[keyParts.length - 1];
        const mode = keyParts[3];
        const href =
          templateId && templateId !== 'none'
            ? `/dashboard/checklists/new?templateId=${templateId}`
            : '/dashboard/checklists/new';

        checklistDrafts.push({
          id: `draft-checklist-${storageKey}`,
          label: 'Checklist',
          title: parsedDraft.values.titulo || 'Checklist em rascunho',
          description:
            parsedDraft.values.descricao ||
            'Rascunho local disponível para continuar a inspeção ou execução.',
          href,
          meta: [
            parsedDraft.savedAt ? `Salvo em ${formatDateTime(parsedDraft.savedAt)}` : null,
            mode === 'tool' ? 'Ferramenta' : mode === 'machine' ? 'Máquina' : 'Checklist',
          ]
            .filter(Boolean)
            .join(' • '),
          icon: ClipboardCheck,
          accentClass: 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]',
          kind: 'draft',
          timestamp: parsedDraft.savedAt,
        });
      }

      checklistDrafts
        .sort((first, second) => (second.timestamp || 0) - (first.timestamp || 0))
        .slice(0, 1)
        .forEach((draft) => nextItems.push(draft));
    }

    mappedRecentActivities.slice(0, 3).forEach((activity) => {
      nextItems.push({
        id: `recent-${activity.id}`,
        label: activity.moduleLabel,
        title: activity.description || activity.title,
        description: activity.title,
        href: activity.href,
        meta: `Atualizado em ${formatDateTime(activity.date)}`,
        icon: activity.icon,
        accentClass: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
        kind: 'recent',
        timestamp: new Date(activity.date).getTime(),
      });
    });

    if (recentReports[0]) {
      nextItems.push({
        id: `report-${recentReports[0].id}`,
        label: 'Relatório',
        title: recentReports[0].titulo,
        description: `Relatório ${recentReports[0].mes}/${recentReports[0].ano} disponível para consulta.`,
        href: '/dashboard/reports',
        meta: `Gerado em ${formatDateTime(recentReports[0].created_at)}`,
        icon: FileStack,
        accentClass: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
        kind: 'report',
        timestamp: new Date(recentReports[0].created_at).getTime(),
      });
    }

    const visited = new Set<string>();
    const dedupedItems = nextItems.filter((item) => {
      const uniqueKey = `${item.kind}-${item.href}-${item.title}`;

      if (visited.has(uniqueKey)) {
        return false;
      }

      visited.add(uniqueKey);
      return true;
    });

    setResumeItems(dedupedItems.slice(0, 6));
  }, [mappedRecentActivities, recentReports, user?.company_id, user?.id]);

  const stats = [
    { label: 'Usuários Ativos', value: loading ? '...' : counts.users.toString(), icon: Users, tone: 'ds-kpi-card--primary' },
    { label: 'Empresas', value: loading ? '...' : counts.companies.toString(), icon: Building2, tone: 'ds-kpi-card--success' },
    { label: 'Obras/Setores', value: loading ? '...' : counts.sites.toString(), icon: MapPin, tone: 'ds-kpi-card--warning' },
    { label: 'Checklists', value: loading ? '...' : counts.checklists.toString(), icon: ClipboardCheck, tone: 'ds-kpi-card--accent' },
    { label: 'APRs Geradas', value: loading ? '...' : counts.aprs.toString(), icon: Shield, tone: 'ds-kpi-card--primary' },
    { label: 'Permissões (PT)', value: loading ? '...' : counts.pts.toString(), icon: FileText, tone: 'ds-kpi-card--accent' },
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

  const pendingApprovalsTotal =
    pendingApprovals.aprs +
    pendingApprovals.pts +
    pendingApprovals.checklists +
    pendingApprovals.nonconformities;
  const documentControlTotal = modelCounts.aprs + modelCounts.dds + modelCounts.checklists;
  const recentReportHighlights = recentReports.slice(0, 3);
  const expiredEpisCount = expiringEpis.filter((epi) => isBefore(new Date(epi.validade_ca || ''), new Date())).length;
  const expiredTrainingsCount = expiringTrainings.filter((training) => isBefore(new Date(training.data_vencimento), new Date())).length;
  const averageSiteCompliance = siteCompliance.length
    ? Math.round(siteCompliance.reduce((acc, site) => acc + site.taxa, 0) / siteCompliance.length)
    : 0;
  const topSiteCompliance = [...siteCompliance]
    .sort((first, second) => second.taxa - first.taxa)
    .slice(0, 3);

  return (
    <div className="ds-dashboard-shell">
      <div className="ds-dashboard-panel ds-hero-panel overflow-hidden p-5 lg:p-6">
        <div className="relative z-[1] flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2.5 inline-flex items-center rounded-md border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              {personaGuide.badge}
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ds-color-text-primary)] lg:text-[2rem]">{personaGuide.title}</h1>
            <p className="mt-2.5 max-w-2xl text-[13px] text-[var(--ds-color-text-secondary)]">
              {personaGuide.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {heroChips.map((chip) => (
                <StatusPill key={chip.label} tone={resolveHeroChipTone(chip.tone)}>
                  <chip.icon className={`h-4 w-4 ${chip.tone}`} />
                  {chip.label}
                </StatusPill>
              ))}
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3 xl:min-w-[25rem]">
            {operationalHighlights.map((item) => (
              <div
                key={item.label}
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] px-4 py-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--ds-color-surface-muted)]/32">
                    <item.icon className={`h-4 w-4 ${item.tone}`} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-[var(--ds-color-text-primary)]">{item.value}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-[var(--ds-color-text-muted)]">{item.hint}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-[1] mt-5 flex flex-wrap gap-2.5">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                Continuar de onde parou
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">
                Retome rascunhos e documentos recentes sem perder contexto.
              </h2>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                O painel prioriza o que você já estava construindo e o que foi atualizado por último.
              </p>
            </div>
            <Link
              href={personaGuide.primaryAction.href}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[color:var(--ds-color-surface-muted)]/40"
            >
              {personaGuide.primaryAction.label}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {resumeItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-5 text-sm text-[var(--ds-color-text-secondary)]">
              Nenhum rascunho local ou documento recente para retomar agora. Use os atalhos acima para iniciar o próximo fluxo.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {resumeItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--ds-color-action-primary)]/35 hover:shadow-[var(--ds-shadow-md)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${item.accentClass}`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${RESUME_ACCENT_BY_KIND[item.kind]}`}>
                      {item.kind === 'draft'
                        ? 'rascunho'
                        : item.kind === 'report'
                          ? 'relatório'
                          : 'recente'}
                    </span>
                  </div>
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                      {item.label}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-sm text-[var(--ds-color-text-secondary)]">
                      {item.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--ds-color-text-muted)]">
                      <span>{item.meta}</span>
                      <span className="font-semibold text-[var(--ds-color-action-primary)] transition-transform group-hover:translate-x-0.5">
                        Retomar
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="ds-dashboard-panel p-5">
          <div className="inline-flex items-center rounded-md border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
            Entrada por perfil
          </div>
          <h2 className="mt-3 text-lg font-bold text-[var(--ds-color-text-primary)]">
            {personaGuide.focusTitle}
          </h2>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            Perfil atual: <span className="font-semibold text-[var(--ds-color-text-primary)]">{user?.profile?.nome || 'Perfil não identificado'}</span>
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 p-4">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {personaGuide.primaryAction.label}
                </p>
                <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                  Empresa base: {user?.company?.razao_social || 'Empresa padrão'}
                  {user?.site?.nome ? ` • Site preferencial: ${user.site.nome}` : ''}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {personaGuide.focusPoints.map((point) => (
                <div key={point} className="flex items-start gap-2.5 text-sm text-[var(--ds-color-text-secondary)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-color-success)]" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href={personaGuide.primaryAction.href}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--ds-color-action-primary)] px-3.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-color-action-primary-hover)]"
            >
              {personaGuide.primaryAction.label}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href={secondaryEntryAction.href}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-color-border-subtle)] px-3.5 py-2.5 text-sm font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/40"
            >
              {secondaryEntryAction.label}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="ds-dashboard-panel p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                sinal do dia
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">Leitura rápida da operação</h2>
            </div>
            <StatusPill tone={safetyScore > 80 ? 'success' : safetyScore > 50 ? 'warning' : 'danger'}>
              {safetyScore}% de compliance
            </StatusPill>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Aprovações e desvios
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">{pendingApprovalsTotal}</p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">Itens aguardando decisão, assinatura ou fechamento.</p>
            </div>
            <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Evidências rastreadas
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">{evidenceSummary.total}</p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">Inspeções, auditorias e NCs já vinculadas com prova operacional.</p>
            </div>
            <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Biblioteca ativa
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">{documentControlTotal}</p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">Modelos em uso para APR, DDS e checklists operacionais.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/pts" className="ds-inline-link-list__item">
              Ver PTs pendentes
            </Link>
            <Link href="/dashboard/nonconformities" className="ds-inline-link-list__item">
              Tratar NCs
            </Link>
            <Link href="/dashboard/document-registry" className="ds-inline-link-list__item">
              Abrir registry
            </Link>
          </div>
        </div>

        <GandraInsights />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((stat, index) => (
          <div key={index} className="ds-dashboard-panel px-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-sm)]">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  resolveDashboardToneClasses(stat.tone),
                )}
              >
                <stat.icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                  {stat.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-[var(--ds-color-text-primary)]">
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="ds-dashboard-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                Fila central de pendências
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">
                O que exige ação agora, em um único recorte operacional.
              </h2>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                A fila consolida documentos pendentes, saúde ocupacional e ações corretivas com prioridade e rota direta para atuação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUEUE_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setQueueFilter(filter.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    queueFilter === filter.id
                      ? 'border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]'
                      : 'border-[var(--ds-color-border-subtle)] text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)]/35'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {filteredPendingQueueItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-5 text-sm text-[var(--ds-color-text-secondary)]">
                Nenhuma pendência encontrada para o filtro atual.
              </div>
            ) : (
              filteredPendingQueueItems.map((item) => {
                const ItemIcon = resolveQueueModuleIcon(item.module);
                return (
                  <div
                    key={item.id}
                    className="block rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--ds-color-action-primary)]/35 hover:shadow-[var(--ds-shadow-md)]"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-color-surface-muted)]/45 text-[var(--ds-color-action-primary)]">
                          <ItemIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                              {item.module}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${resolveQueuePriorityClasses(item.priority)}`}>
                              {item.priority === 'critical'
                                ? 'crítica'
                                : item.priority === 'high'
                                  ? 'alta'
                                  : 'média'}
                            </span>
                          </div>
                          <h3 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">
                            {item.title}
                          </h3>
                          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                            {item.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-[var(--ds-color-text-muted)] lg:max-w-[18rem] lg:justify-end">
                        <span className="rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2.5 py-1">
                          Status: {item.status}
                        </span>
                        <span className="rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2.5 py-1">
                          Prazo: {formatDateOnly(item.dueDate)}
                        </span>
                        {item.site ? (
                          <span className="rounded-full bg-[color:var(--ds-color-surface-muted)]/45 px-2.5 py-1">
                            {item.site}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 text-xs text-[var(--ds-color-text-muted)]">
                      <span>
                        Responsável: <span className="font-semibold text-[var(--ds-color-text-secondary)]">{item.responsible || 'Não definido'}</span>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={item.href}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] px-3 py-1.5 font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[color:var(--ds-color-primary-subtle)]"
                        >
                          Abrir pendência
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        {canUseAi ? (
                          <Link
                            href={buildPendingQueueSophieHref(item)}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-1.5 font-semibold text-[var(--ds-color-warning)] transition-colors hover:brightness-95"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {resolvePendingQueueSophieLabel(item)}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="ds-dashboard-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Resumo da fila
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-danger)]">Críticas</p>
                <p className="mt-1 text-2xl font-bold text-[var(--ds-color-danger)]">{pendingQueue.summary.critical}</p>
              </div>
              <div className="rounded-2xl border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-warning)]">Altas</p>
                <p className="mt-1 text-2xl font-bold text-[var(--ds-color-warning)]">{pendingQueue.summary.high}</p>
              </div>
              <div className="rounded-2xl border border-[var(--ds-color-info-border)] bg-[color:var(--ds-color-info-subtle)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-info)]">Médias</p>
                <p className="mt-1 text-2xl font-bold text-[var(--ds-color-info)]">{pendingQueue.summary.medium}</p>
              </div>
              <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">Total</p>
                <p className="mt-1 text-2xl font-bold text-[var(--ds-color-text-primary)]">{pendingQueue.summary.total}</p>
              </div>
            </div>
          </div>

          <div className="ds-dashboard-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Distribuição
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">Documentos</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingQueue.summary.documents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">Saúde ocupacional</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingQueue.summary.health}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ds-color-text-secondary)]">Ações corretivas</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingQueue.summary.actions}</span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 p-4 text-sm text-[var(--ds-color-text-secondary)]">
              Use os filtros para alternar rapidamente entre bloqueios críticos, documentos e saúde ocupacional sem sair da home.
              {canUseAi ? ' As pendências agora também podem ser enviadas direto para a SOPHIE com contexto pronto.' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                execução priorizada
              </p>
              <h2 className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">Plano de ação do turno</h2>
            </div>
            <Link href="/dashboard/inspections" className="text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">
              Ver ações
            </Link>
          </div>
          {actionPlanItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-[var(--ds-color-success)]" />
              <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Nenhuma ação pendente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionPlanItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col rounded-xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-3 hover:border-[color:var(--ds-color-warning-border)] hover:bg-[color:var(--ds-color-warning-subtle)]"
                >
                  <div className="flex items-center justify-between gap-3">
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

        <div className="ds-dashboard-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
                governança prioritária
              </p>
              <h2 className="mt-1 text-base font-bold text-[var(--ds-color-text-primary)]">Risco, aprovações e rastreabilidade no mesmo recorte</h2>
            </div>
            <Link href="/dashboard/risks" className="text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline">
              Abrir matriz
            </Link>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-3.5 py-2.5">
            <span className="text-sm font-semibold text-[var(--ds-color-danger)]">Riscos altos</span>
            <span className="text-lg font-bold text-[var(--ds-color-danger)]">{riskSummary.alto}</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Aprovações pendentes
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">{pendingApprovalsTotal}</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">APRs</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.aprs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">PTs</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.pts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">Checklists</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.checklists}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">NCs</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{pendingApprovals.nonconformities}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                Rastreabilidade documental
              </p>
              <p className="mt-2 text-2xl font-bold text-[var(--ds-color-text-primary)]">{documentControlTotal}</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">Evidências</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{evidenceSummary.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">Inspeções e auditorias</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{evidenceSummary.inspections + evidenceSummary.audits}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--ds-color-text-secondary)]">Modelos ativos</span>
                  <span className="font-semibold text-[var(--ds-color-text-primary)]">{documentControlTotal}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="ds-inline-link-list mt-4">
            <Link href="/dashboard/inspections" className="ds-inline-link-list__item">Evidências</Link>
            <Link href="/dashboard/checklist-models" className="ds-inline-link-list__item">Modelos</Link>
            <Link href="/dashboard/document-registry" className="ds-inline-link-list__item">Registry</Link>
          </div>
        </div>
      </div>

      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              vencimentos críticos
            </p>
            <h2 className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">EPIs e treinamentos que pedem ação</h2>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Um único recorte para acompanhar o que já venceu e o que está prestes a travar a operação.
            </p>
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
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
                <AlertCircle className="mr-2 h-5 w-5 text-[var(--ds-color-warning)]" />
                EPIs
              </h3>
              <Link href="/dashboard/epis" className="ds-section-link">
                Ver todos
              </Link>
            </div>

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent"></div>
              </div>
            ) : expiringEpis.length > 0 ? (
              <div className="space-y-3">
                {expiringEpis.slice(0, 4).map((epi) => {
                  const isExpired = isBefore(new Date(epi.validade_ca || ''), new Date());
                  return (
                    <div key={epi.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
                      <div className="flex items-center space-x-3">
                        <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`}></div>
                        <div>
                          <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{epi.nome}</p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">CA: {epi.ca}</p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? 'danger' : 'warning'}>
                        {isExpired ? 'Vencido' : `Vence em ${format(new Date(epi.validade_ca || ''), 'dd/MM/yyyy')}`}
                      </StatusPill>
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

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
                <GraduationCap className="mr-2 h-5 w-5 text-[var(--ds-color-warning)]" />
                Treinamentos
              </h3>
              <Link href="/dashboard/trainings" className="ds-section-link">
                Ver todos
              </Link>
            </div>

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-[color:var(--ds-color-action-primary)] border-t-transparent"></div>
              </div>
            ) : expiringTrainings.length > 0 ? (
              <div className="space-y-3">
                {expiringTrainings.slice(0, 4).map((training) => {
                  const isExpired = isBefore(new Date(training.data_vencimento), new Date());
                  return (
                    <div key={training.id} className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5">
                      <div className="flex items-center space-x-3">
                        <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-[var(--ds-color-danger)]' : 'bg-[var(--ds-color-warning)]'}`}></div>
                        <div>
                          <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{training.nome}</p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">{training.user?.nome || 'Colaborador'}</p>
                        </div>
                      </div>
                      <StatusPill tone={isExpired ? 'danger' : 'warning'}>
                        {isExpired ? 'Vencido' : `Vence em ${format(new Date(training.data_vencimento), 'dd/MM/yyyy')}`}
                      </StatusPill>
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
      </div>

      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Atividade e relatórios</h2>
          <Link href="/dashboard/reports" className="ds-section-link">
            Ver central
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            {mappedRecentActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-[var(--ds-color-success)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ds-color-text-muted)]">Nenhuma atualização recente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mappedRecentActivities.slice(0, 4).map((activity) => (
                  <Link key={activity.id} href={activity.href} className="flex items-start space-x-3 rounded-lg border border-transparent px-2.5 py-2.5 hover:border-[var(--ds-color-border-subtle)] hover:bg-[color:var(--ds-color-surface-muted)]/14">
                    <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[color:var(--ds-color-surface-muted)]/40 text-[var(--ds-color-action-primary)]">
                      <activity.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--ds-color-text-primary)]">{activity.title}</p>
                      <p className="text-xs text-[var(--ds-color-text-secondary)]">
                        {activity.moduleLabel} • {activity.description}
                      </p>
                      <p className="mt-1 text-[10px] font-medium text-[var(--ds-color-text-muted)]">{format(new Date(activity.date), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
              Relatórios recentes
            </p>
            {recentReportHighlights.length > 0 ? (
              <div className="mt-3 space-y-2">
                {recentReportHighlights.map((report) => (
                  <Link
                    key={report.id}
                    href="/dashboard/reports"
                    className="flex items-center justify-between rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3.5 py-2.5 hover:border-[var(--ds-color-action-primary)]/25 hover:bg-[color:var(--ds-color-surface-muted)]/12"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{report.titulo}</p>
                      <p className="text-xs text-[var(--ds-color-text-muted)]">{report.mes}/{report.ano}</p>
                    </div>
                    <span className="text-xs text-[var(--ds-color-text-muted)]">{format(new Date(report.created_at), 'dd/MM/yyyy')}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[12rem] items-center justify-center text-center text-sm text-[var(--ds-color-text-muted)]">
                Nenhum relatório recente disponível agora.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SST Indicators Section */}
      <div className="ds-dashboard-panel p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center text-base font-bold text-[var(--ds-color-text-primary)]">
              <TrendingUp className="mr-2 h-5 w-5 text-[var(--ds-color-action-primary)]" />
              Indicadores SST
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Dois gráficos para tendência e um resumo executivo para leitura rápida.
            </p>
          </div>
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

          <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
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
            <div className="mt-4 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-3 text-sm text-[var(--ds-color-text-secondary)]">
              Use este bloco para leitura gerencial. As listas críticas já estão destacadas acima para atuação operacional.
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
