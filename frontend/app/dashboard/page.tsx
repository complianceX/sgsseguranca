'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
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
  AlertTriangle
} from 'lucide-react';
import { usersService } from '@/services/usersService';
import { companiesService } from '@/services/companiesService';
import { sitesService } from '@/services/sitesService';
import { checklistsService } from '@/services/checklistsService';
import { aprsService } from '@/services/aprsService';
import { ptsService } from '@/services/ptsService';
import { episService, Epi } from '@/services/episService';
import { trainingsService, Training } from '@/services/trainingsService';
import { auditsService } from '@/services/auditsService';
import { inspectionsService } from '@/services/inspectionsService';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { ddsService } from '@/services/ddsService';
import { reportsService, Report } from '@/services/reportsService';
import { aiService } from '@/services/aiService';
import { format, isBefore, addDays } from 'date-fns';
import { GandraInsights } from '@/components/GandraInsights';
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

export default function DashboardPage() {
  const { user } = useAuth();
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
  const [expiringEpis, setExpiringEpis] = useState<Epi[]>([]);
  const [expiringTrainings, setExpiringTrainings] = useState<Training[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState({
    aprs: 0,
    pts: 0,
    checklists: 0,
    nonconformities: 0,
  });
  const [actionPlanItems, setActionPlanItems] = useState<{
    id: string;
    source: string;
    title: string;
    action: string;
    responsavel?: string;
    prazo?: string;
    status?: string;
    href: string;
  }[]>([]);
  const [riskSummary, setRiskSummary] = useState({
    alto: 0,
    medio: 0,
    baixo: 0,
  });
  const [evidenceSummary, setEvidenceSummary] = useState({
    total: 0,
    inspections: 0,
    nonconformities: 0,
    audits: 0,
  });
  const [modelCounts, setModelCounts] = useState({
    aprs: 0,
    dds: 0,
    checklists: 0,
  });
  const [recentActivities, setRecentActivities] = useState<{
    id: string;
    title: string;
    description: string;
    date: string;
    href: string;
    color: string;
  }[]>([]);
  const [siteCompliance, setSiteCompliance] = useState<{
    id: string;
    nome: string;
    total: number;
    conformes: number;
    taxa: number;
  }[]>([]);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [ncMonthlyData, setNcMonthlyData] = useState<{ mes: string; total: number }[]>([]);
  const [trainingSummaryData, setTrainingSummaryData] = useState<{ name: string; value: number; fill: string }[]>([]);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const results = await Promise.allSettled([
          usersService.findAll(),
          companiesService.findAll(),
          sitesService.findAll(),
          checklistsService.findAll(),
          aprsService.findAll(),
          ptsService.findAll(),
          episService.findAll(),
          trainingsService.findAll(),
          aiService.getInsights(),
          auditsService.findAll(),
          inspectionsService.findAll(),
          nonConformitiesService.findAll(),
          ddsService.findAll(),
          reportsService.findAll(),
        ]);

        const [usersR, companiesR, sitesR, checklistsR, aprsR, ptsR, episR, trainingsR, aiInsightsR, auditsR, inspectionsR, nonconformitiesR, ddsR, reportsR] = results;

        const users = usersR.status === 'fulfilled' ? usersR.value : [];
        const companies = companiesR.status === 'fulfilled' ? companiesR.value : [];
        const sites = sitesR.status === 'fulfilled' ? sitesR.value : [];
        const checklists = checklistsR.status === 'fulfilled' ? checklistsR.value : [];
        const aprs = aprsR.status === 'fulfilled' ? aprsR.value : [];
        const pts = ptsR.status === 'fulfilled' ? ptsR.value : [];
        const epis = episR.status === 'fulfilled' ? episR.value : [];
        const trainings = trainingsR.status === 'fulfilled' ? trainingsR.value : [];
        const aiInsights = aiInsightsR.status === 'fulfilled' ? aiInsightsR.value : null;
        const audits = auditsR.status === 'fulfilled' ? auditsR.value : [];
        const inspections = inspectionsR.status === 'fulfilled' ? inspectionsR.value : [];
        const nonconformities = nonconformitiesR.status === 'fulfilled' ? nonconformitiesR.value : [];
        const dds = ddsR.status === 'fulfilled' ? ddsR.value : [];
        const reports = reportsR.status === 'fulfilled' ? reportsR.value : [];

        setCounts({
          users: users.length,
          companies: companies.length,
          sites: sites.length,
          checklists: checklists.length,
          aprs: aprs.length,
          pts: pts.length,
        });

        if (aiInsights?.safetyScore !== undefined) setSafetyScore(aiInsights.safetyScore);

        // Filtrar EPIs vencidos ou vencendo em 30 dias
        const today = new Date();
        const warningLimit = addDays(today, 30);
        
        const expiring = epis.filter(epi => {
          if (!epi.validade_ca) return false;
          const validityDate = new Date(epi.validade_ca);
          return isBefore(validityDate, warningLimit);
        }).sort((a, b) => {
          if (!a.validade_ca || !b.validade_ca) return 0;
          return new Date(a.validade_ca).getTime() - new Date(b.validade_ca).getTime();
        });

        setExpiringEpis(expiring.slice(0, 5));

        const trainingExpiring = trainings.filter(training => {
          const expiry = new Date(training.data_vencimento);
          return isBefore(expiry, warningLimit);
        }).sort((a, b) => {
          return new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime();
        });

        setExpiringTrainings(trainingExpiring.slice(0, 5));

        const siteNameMap = new Map(sites.map(site => [site.id, site.nome]));

        const pendingNonconformities = nonconformities.filter((item) => {
          const status = (item.status || '').toLowerCase();
          return status && status !== 'encerrada' && status !== 'concluída' && status !== 'concluida';
        }).length;

        setPendingApprovals({
          aprs: aprs.filter((item) => item.status === 'Pendente').length,
          pts: pts.filter((item) => item.status === 'Pendente').length,
          checklists: checklists.filter((item) => item.status === 'Pendente').length,
          nonconformities: pendingNonconformities,
        });

        const actionItems: {
          id: string;
          source: string;
          title: string;
          action: string;
          responsavel?: string;
          prazo?: string;
          status?: string;
          href: string;
        }[] = [];

        inspections.forEach((inspection) => {
          inspection.plano_acao?.forEach((item, index) => {
            actionItems.push({
              id: `inspection-${inspection.id}-${index}`,
              source: 'Inspeção',
              title: inspection.setor_area,
              action: item.acao,
              responsavel: item.responsavel,
              prazo: item.prazo,
              status: item.status,
              href: `/dashboard/inspections/edit/${inspection.id}`,
            });
          });
        });

        audits.forEach((audit) => {
          audit.plano_acao?.forEach((item, index) => {
            actionItems.push({
              id: `audit-${audit.id}-${index}`,
              source: 'Auditoria',
              title: audit.titulo,
              action: item.acao,
              responsavel: item.responsavel,
              prazo: item.prazo,
              status: item.status,
              href: `/dashboard/audits/edit/${audit.id}`,
            });
          });
        });

        nonconformities.forEach((item) => {
          if (item.acao_imediata_descricao) {
            actionItems.push({
              id: `nc-imediata-${item.id}`,
              source: 'Não Conformidade',
              title: item.codigo_nc,
              action: item.acao_imediata_descricao,
              responsavel: item.acao_imediata_responsavel,
              prazo: item.acao_imediata_data,
              status: item.acao_imediata_status || item.status,
              href: `/dashboard/nonconformities/edit/${item.id}`,
            });
          }
          if (item.acao_definitiva_descricao) {
            actionItems.push({
              id: `nc-definitiva-${item.id}`,
              source: 'Não Conformidade',
              title: item.codigo_nc,
              action: item.acao_definitiva_descricao,
              responsavel: item.acao_definitiva_responsavel,
              prazo: item.acao_definitiva_prazo || item.acao_definitiva_data_prevista,
              status: item.status,
              href: `/dashboard/nonconformities/edit/${item.id}`,
            });
          }
        });

        const actionItemsSorted = actionItems
          .sort((a, b) => {
            const aDate = a.prazo ? new Date(a.prazo).getTime() : Number.MAX_SAFE_INTEGER;
            const bDate = b.prazo ? new Date(b.prazo).getTime() : Number.MAX_SAFE_INTEGER;
            return aDate - bDate;
          })
          .slice(0, 6);

        setActionPlanItems(actionItemsSorted);

        const riskCounts = { alto: 0, medio: 0, baixo: 0 };
        const applyRisk = (value?: string) => {
          if (!value) return;
          const level = value.toLowerCase();
          if (level.includes('alto')) {
            riskCounts.alto += 1;
          } else if (level.includes('médio') || level.includes('medio')) {
            riskCounts.medio += 1;
          } else if (level.includes('baixo')) {
            riskCounts.baixo += 1;
          }
        };

        inspections.forEach((inspection) => {
          inspection.perigos_riscos?.forEach((risk) => applyRisk(risk.classificacao_risco));
        });

        nonconformities.forEach((item) => applyRisk(item.risco_nivel));

        setRiskSummary(riskCounts);

        const inspectionEvidence = inspections.reduce(
          (total, inspection) => total + (inspection.evidencias?.length || 0),
          0,
        );
        const nonconformityEvidence = nonconformities.reduce(
          (total, item) => total + (item.anexos?.length || 0),
          0,
        );
        const auditEvidence = audits.reduce(
          (total, audit) => total + (audit.resultados_nao_conformidades?.length || 0),
          0,
        );

        setEvidenceSummary({
          total: inspectionEvidence + nonconformityEvidence + auditEvidence,
          inspections: inspectionEvidence,
          nonconformities: nonconformityEvidence,
          audits: auditEvidence,
        });

        setModelCounts({
          aprs: aprs.filter((item) => item.is_modelo).length,
          dds: dds.filter((item) => item.is_modelo).length,
          checklists: checklists.filter((item) => item.is_modelo).length,
        });

        const activityItems: {
          id: string;
          title: string;
          description: string;
          date: string;
          href: string;
          color: string;
        }[] = [];

        aprs.forEach((item) => {
          activityItems.push({
            id: `apr-${item.id}`,
            title: 'APR atualizada',
            description: item.titulo,
            date: item.updated_at || item.created_at,
            href: '/dashboard/aprs',
            color: 'bg-blue-500',
          });
        });

        pts.forEach((item) => {
          activityItems.push({
            id: `pt-${item.id}`,
            title: 'PT atualizada',
            description: item.titulo,
            date: item.updated_at || item.created_at,
            href: '/dashboard/pts',
            color: 'bg-indigo-500',
          });
        });

        checklists.forEach((item) => {
          activityItems.push({
            id: `checklist-${item.id}`,
            title: 'Checklist atualizado',
            description: item.titulo,
            date: item.updated_at || item.created_at,
            href: '/dashboard/checklists',
            color: 'bg-emerald-500',
          });
        });

        inspections.forEach((item) => {
          activityItems.push({
            id: `inspection-${item.id}`,
            title: 'Inspeção registrada',
            description: item.setor_area,
            date: item.updated_at || item.created_at,
            href: '/dashboard/inspections',
            color: 'bg-amber-500',
          });
        });

        audits.forEach((item) => {
          activityItems.push({
            id: `audit-${item.id}`,
            title: 'Auditoria registrada',
            description: item.titulo,
            date: item.updated_at || item.created_at,
            href: '/dashboard/audits',
            color: 'bg-orange-500',
          });
        });

        nonconformities.forEach((item) => {
          activityItems.push({
            id: `nc-${item.id}`,
            title: 'Não conformidade atualizada',
            description: item.codigo_nc,
            date: item.updated_at || item.created_at,
            href: '/dashboard/nonconformities',
            color: 'bg-red-500',
          });
        });

        trainings.forEach((item) => {
          activityItems.push({
            id: `training-${item.id}`,
            title: 'Treinamento registrado',
            description: item.nome,
            date: item.data_conclusao,
            href: '/dashboard/trainings',
            color: 'bg-purple-500',
          });
        });

        setRecentActivities(
          activityItems
            .filter((item) => item.date)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 6),
        );

        const complianceBySite = Array.from(
          checklists.reduce((map, checklist) => {
            const current = map.get(checklist.site_id) || {
              total: 0,
              conformes: 0,
            };
            current.total += 1;
            if (checklist.status === 'Conforme') {
              current.conformes += 1;
            }
            map.set(checklist.site_id, current);
            return map;
          }, new Map<string, { total: number; conformes: number }>()),
        ).map(([id, stats]) => ({
          id,
          nome: siteNameMap.get(id) || 'Sem obra',
          total: stats.total,
          conformes: stats.conformes,
          taxa: stats.total > 0 ? Math.round((stats.conformes / stats.total) * 100) : 0,
        }));

        setSiteCompliance(
          complianceBySite.sort((a, b) => b.taxa - a.taxa).slice(0, 5),
        );

        setRecentReports(
          reports
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 4),
        );

        // SST Charts data
        try {
          const [monthlyR, expSummaryR] = await Promise.allSettled([
            nonConformitiesService.getMonthlyAnalytics(),
            trainingsService.getExpirySummary(),
          ]);
          if (monthlyR.status === 'fulfilled') {
            setNcMonthlyData(monthlyR.value.map((r) => ({
              mes: r.mes.slice(0, 7),
              total: r.total,
            })));
          }
          if (expSummaryR.status === 'fulfilled') {
            const s = expSummaryR.value;
            setTrainingSummaryData([
              { name: 'Em dia', value: s.valid, fill: '#10b981' },
              { name: 'Vencendo', value: s.expiringSoon, fill: '#f59e0b' },
              { name: 'Vencidos', value: s.expired, fill: '#ef4444' },
            ]);
          }
        } catch {
          // SST chart data is non-critical
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
    { label: 'Usuários Ativos', value: loading ? '...' : counts.users.toString(), icon: Users, color: 'text-blue-100', bg: 'bg-gradient-to-br from-blue-500 to-cyan-500' },
    { label: 'Empresas', value: loading ? '...' : counts.companies.toString(), icon: Building2, color: 'text-emerald-100', bg: 'bg-gradient-to-br from-emerald-500 to-green-500' },
    { label: 'Obras/Setores', value: loading ? '...' : counts.sites.toString(), icon: MapPin, color: 'text-amber-100', bg: 'bg-gradient-to-br from-amber-500 to-orange-500' },
    { label: 'Checklists', value: loading ? '...' : counts.checklists.toString(), icon: ClipboardCheck, color: 'text-fuchsia-100', bg: 'bg-gradient-to-br from-fuchsia-500 to-violet-500' },
    { label: 'APRs Geradas', value: loading ? '...' : counts.aprs.toString(), icon: Shield, color: 'text-rose-100', bg: 'bg-gradient-to-br from-rose-500 to-red-500' },
    { label: 'Permissões (PT)', value: loading ? '...' : counts.pts.toString(), icon: FileText, color: 'text-indigo-100', bg: 'bg-gradient-to-br from-indigo-500 to-blue-600' },
  ];

  const quickActions = [
    { label: 'Nova APR', href: '/dashboard/aprs', icon: PlusCircle, color: 'bg-gradient-to-r from-blue-500 to-cyan-500' },
    { label: 'Nova PT', href: '/dashboard/pts', icon: FileText, color: 'bg-gradient-to-r from-indigo-500 to-violet-500' },
    { label: 'Novo Checklist', href: '/dashboard/checklists', icon: ClipboardCheck, color: 'bg-gradient-to-r from-fuchsia-500 to-purple-500' },
    { label: 'Novo EPI', href: '/dashboard/epis', icon: Shield, color: 'bg-gradient-to-r from-emerald-500 to-green-500' },
    { label: 'Nova NC', href: '/dashboard/nonconformities/new', icon: AlertTriangle, color: 'bg-gradient-to-r from-amber-500 to-orange-500' },
  ];

  return (
    <div className="ds-dashboard-shell">
      <div className="ds-dashboard-panel overflow-hidden p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center rounded-full border border-[color:var(--ds-color-border-strong)]/70 bg-[color:var(--ds-color-surface-muted)]/55 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[var(--ds-color-text-secondary)]">
              cockpit operacional
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.03em] text-gray-900">Olá, {user?.nome}!</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              Visão executiva com conformidade, documentação crítica, treinamentos e ações prioritárias em um único painel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              href={action.href}
              className={`${action.color} flex items-center space-x-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(15,23,42,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_rgba(15,23,42,0.3)]`}
            >
              <action.icon className="h-4 w-4" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card de Score de Segurança */}
        <div className="ds-dashboard-panel flex flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 flex items-center space-x-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-800">Compliance SST</h3>
          </div>
          
          <div className="relative mb-4 h-32 w-32">
            <svg className="h-full w-full" viewBox="0 0 36 36">
              <path
                className="stroke-gray-100 fill-none"
                strokeWidth="3"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className={`${safetyScore > 80 ? 'stroke-emerald-500' : safetyScore > 50 ? 'stroke-amber-500' : 'stroke-red-500'} fill-none transition-all duration-1000 ease-out`}
                strokeWidth="3"
                strokeDasharray={`${safetyScore}, 100`}
                strokeLinecap="round"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-800">{safetyScore}%</span>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Score</span>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 px-4">
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
          <div key={index} className="ds-dashboard-panel ds-dashboard-stat p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-lg)]">
            <div className="flex items-center justify-between">
              <div className={`rounded-2xl ${stat.bg} p-3 shadow-[0_16px_32px_rgba(15,23,42,0.18)]`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="ds-dashboard-panel p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
            Pendências de Aprovação
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">APRs pendentes</span>
              <span className="font-semibold text-gray-900">{pendingApprovals.aprs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">PTs pendentes</span>
              <span className="font-semibold text-gray-900">{pendingApprovals.pts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Checklists pendentes</span>
              <span className="font-semibold text-gray-900">{pendingApprovals.checklists}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">NCs em aberto</span>
              <span className="font-semibold text-gray-900">{pendingApprovals.nonconformities}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">APRs</Link>
            <Link href="/dashboard/pts" className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">PTs</Link>
            <Link href="/dashboard/checklists" className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">Checklists</Link>
            <Link href="/dashboard/nonconformities" className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">NCs</Link>
          </div>
        </div>

        <div className="ds-dashboard-panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Plano de Ação Prioritário</h2>
            <Link href="/dashboard/inspections" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver ações
            </Link>
          </div>
          {actionPlanItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Nenhuma ação pendente no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actionPlanItems.map((item) => (
                <Link key={item.id} href={item.href} className="flex flex-col rounded-lg border border-gray-100 bg-gray-50 p-3 hover:border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700">{item.source}</span>
                    <span className="text-xs text-gray-400">{item.prazo ? format(new Date(item.prazo), 'dd/MM/yyyy') : 'Sem prazo'}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-gray-800">{item.action}</p>
                  <p className="text-xs text-gray-500">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
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
        <div className="ds-dashboard-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Matriz de Risco</h2>
            <Link href="/dashboard/risks" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver riscos
            </Link>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3">
              <span className="text-sm font-semibold text-red-700">Alto</span>
              <span className="text-lg font-bold text-red-700">{riskSummary.alto}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
              <span className="text-sm font-semibold text-amber-700">Médio</span>
              <span className="text-lg font-bold text-amber-700">{riskSummary.medio}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3">
              <span className="text-sm font-semibold text-emerald-700">Baixo</span>
              <span className="text-lg font-bold text-emerald-700">{riskSummary.baixo}</span>
            </div>
          </div>
        </div>

        <div className="ds-dashboard-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Evidências Registradas</h2>
            <Link href="/dashboard/inspections" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver evidências
            </Link>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-4">
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{evidenceSummary.total}</p>
            </div>
            <div className="text-xs text-gray-500 space-y-1 text-right">
              <p>Inspeções: {evidenceSummary.inspections}</p>
              <p>Auditorias: {evidenceSummary.audits}</p>
              <p>NCs: {evidenceSummary.nonconformities}</p>
            </div>
          </div>
        </div>

        <div className="ds-dashboard-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Biblioteca de Modelos</h2>
            <Link href="/dashboard/checklist-models" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver modelos
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Modelos de APR</span>
              <span className="font-semibold text-gray-900">{modelCounts.aprs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Modelos de DDS</span>
              <span className="font-semibold text-gray-900">{modelCounts.dds}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Modelos de Checklist</span>
              <span className="font-semibold text-gray-900">{modelCounts.checklists}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">APRs</Link>
            <Link href="/dashboard/dds" className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">DDS</Link>
            <Link href="/dashboard/checklist-models" className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">Checklists</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-amber-500" />
              EPIs Vencidos ou Próximos do Vencimento
            </h2>
            <Link href="/dashboard/epis" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver todos
            </Link>
          </div>
          
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : expiringEpis.length > 0 ? (
            <div className="space-y-4">
              {expiringEpis.map((epi) => {
                const isExpired = isBefore(new Date(epi.validade_ca || ''), new Date());
                return (
                  <div key={epi.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center space-x-3">
                      <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{epi.nome}</p>
                        <p className="text-xs text-gray-500">CA: {epi.ca} | {epi.nome}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                        {isExpired ? 'VENCIDO' : `Vence em ${format(new Date(epi.validade_ca || ''), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Todos os EPIs estão com CA em dia.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <GraduationCap className="mr-2 h-5 w-5 text-amber-500" />
              Treinamentos Vencidos ou Próximos do Vencimento
            </h2>
            <Link href="/dashboard/trainings" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : expiringTrainings.length > 0 ? (
            <div className="space-y-4">
              {expiringTrainings.map((training) => {
                const isExpired = isBefore(new Date(training.data_vencimento), new Date());
                return (
                  <div key={training.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center space-x-3">
                      <div className={`h-2 w-2 rounded-full ${isExpired ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{training.nome}</p>
                        <p className="text-xs text-gray-500">{training.user?.nome || 'Colaborador'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-bold ${isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                        {isExpired ? 'VENCIDO' : `Vence em ${format(new Date(training.data_vencimento), 'dd/MM/yyyy')}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Todos os treinamentos estão em dia.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <MapPin className="mr-2 h-5 w-5 text-blue-500" />
              Benchmark de Conformidade por Obra
            </h2>
            <Link href="/dashboard/checklists" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : siteCompliance.length > 0 ? (
            <div className="space-y-4">
              {siteCompliance.map((site) => (
                <div key={site.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{site.nome}</p>
                      <p className="text-xs text-gray-500">{site.conformes} conformes de {site.total}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-blue-600">{site.taxa}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Nenhum checklist registrado.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Trilha de Auditoria</h2>
            <Link href="/dashboard/reports" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver relatórios
            </Link>
          </div>
          {recentActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Nenhuma atualização recente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <Link key={activity.id} href={activity.href} className="flex items-start space-x-3 rounded-lg p-3 hover:bg-gray-50">
                  <div className={`mt-1 h-2 w-2 rounded-full ${activity.color}`}></div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{activity.title}</p>
                    <p className="text-xs text-gray-500">{activity.description}</p>
                    <p className="mt-1 text-[10px] text-gray-400 font-medium">{format(new Date(activity.date), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Relatórios Recentes</h2>
            <Link href="/dashboard/reports" className="text-sm font-semibold text-blue-600 hover:underline">
              Ver relatórios
            </Link>
          </div>
          {recentReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-100" />
              <p className="mt-2 text-sm text-gray-500 font-medium">Nenhum relatório gerado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <Link key={report.id} href="/dashboard/reports" className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 hover:border-blue-200">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{report.titulo}</p>
                    <p className="text-xs text-gray-500">{report.mes}/{report.ano}</p>
                  </div>
                  <span className="text-xs text-gray-400">{format(new Date(report.created_at), 'dd/MM/yyyy')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Aprovação e Assinaturas</h2>
            <Link href="/dashboard/settings" className="text-sm font-semibold text-blue-600 hover:underline">
              Configurar
            </Link>
          </div>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Assinaturas digitais disponíveis nos módulos de APR, PT, Checklist, Treinamentos e Auditorias.</p>
            <p>Use o status de pendências para priorizar validações e fechamento de ações críticas.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <Link href="/dashboard/aprs" className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">APRs</Link>
            <Link href="/dashboard/pts" className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">PTs</Link>
            <Link href="/dashboard/checklists" className="rounded-full bg-purple-50 px-3 py-1 text-purple-700">Checklists</Link>
            <Link href="/dashboard/trainings" className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Treinamentos</Link>
          </div>
        </div>
      </div>

      {/* SST Indicators Section */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-bold text-gray-900 flex items-center">
          <TrendingUp className="mr-2 h-5 w-5 text-blue-600" />
          Indicadores SST
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Chart 1: Conformidade por Obra */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-600">Conformidade por Obra (%)</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={siteCompliance} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}%`, 'Conformidade']} />
                <Bar dataKey="taxa" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Evolução de NCs */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-600">Não Conformidades (últimos 12 meses)</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ncMonthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="NCs" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3: Status de Treinamentos */}
          <div>
            <p className="mb-3 text-sm font-semibold text-gray-600">Status de Treinamentos</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trainingSummaryData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
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
