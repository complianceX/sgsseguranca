'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Siren, Timer } from 'lucide-react';
import { dashboardService, DashboardHeatmapResponse, DashboardKpisResponse } from '@/services/dashboardService';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LazyChart } from '@/components/LazyChart';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { CACHE_KEYS } from '@/lib/cache/cacheKeys';
import { safeToLocaleString } from '@/lib/date/safeFormat';

const DASHBOARD_EXECUTIVE_CACHE_TTL_MS = 60_000;

const ExecutiveRiskTrendChart = dynamic(
  () =>
    import('./components/ExecutiveCharts').then(
      (module) => module.ExecutiveRiskTrendChart,
    ),
  {
    ssr: false,
    loading: () => <LazyChart height={208} />,
  },
);

const ExecutiveNcTrendChart = dynamic(
  () =>
    import('./components/ExecutiveCharts').then(
      (module) => module.ExecutiveNcTrendChart,
    ),
  {
    ssr: false,
    loading: () => <LazyChart height={208} />,
  },
);

function scoreVariant(score: number): 'danger' | 'warning' | 'accent' | 'success' {
  if (score >= 61) return 'danger';
  if (score >= 31) return 'warning';
  if (score >= 11) return 'accent';
  return 'success';
}

export default function ExecutiveDashboardPage() {
  const kpisCache = useCachedFetch(
    CACHE_KEYS.executiveKpis,
    dashboardService.getKpis,
    DASHBOARD_EXECUTIVE_CACHE_TTL_MS,
  );
  const heatmapCache = useCachedFetch(
    CACHE_KEYS.executiveHeatmap,
    dashboardService.getHeatmap,
    DASHBOARD_EXECUTIVE_CACHE_TTL_MS,
  );
  const [kpis, setKpis] = useState<DashboardKpisResponse | null>(null);
  const [heatmap, setHeatmap] = useState<DashboardHeatmapResponse>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([kpisCache.fetch(), heatmapCache.fetch()])
      .then(([kpiData, heatmapData]) => {
        setKpis(kpiData);
        setHeatmap(heatmapData);
      })
      .finally(() => setLoading(false));
  }, [heatmapCache, kpisCache]);

  const leadingCards = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        label: 'APR antes da tarefa',
        value: `${kpis.leading.apr_before_task.percentage}%`,
        helper: `${kpis.leading.apr_before_task.compliant}/${kpis.leading.apr_before_task.total}`,
      },
      {
        label: 'Inspeções concluídas',
        value: `${kpis.leading.completed_inspections.percentage}%`,
        helper: `${kpis.leading.completed_inspections.completed}/${kpis.leading.completed_inspections.total}`,
      },
      {
        label: 'Compliance treinamentos',
        value: `${kpis.leading.training_compliance.percentage}%`,
        helper: `${kpis.leading.training_compliance.compliant}/${kpis.leading.training_compliance.total}`,
      },
    ];
  }, [kpis]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <Badge variant="accent" className="w-fit">Visão executiva</Badge>
            <div>
              <CardTitle className="text-xl">Cockpit Executivo SST</CardTitle>
              <CardDescription className="mt-1">
                Indicadores leading e lagging por obra, com leitura rápida de tendência, desvios
                e saturação de risco.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExecutivePill label="Obras no heatmap" value={String(heatmap.length)} />
            <ExecutivePill label="Alertas ativos" value={String(kpis?.alerts.length ?? 0)} variant="warning" />
            <ExecutivePill label="Risco em tendência" value={String(kpis?.trends.risk.length ?? 0)} variant="info" />
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {leadingCards.map((card, index) => (
          <div
            key={card.label}
            className={`ds-kpi-card ${
              index === 1 ? 'ds-kpi-card--success' : index === 2 ? 'ds-kpi-card--accent' : 'ds-kpi-card--primary'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-current opacity-80">{card.label}</p>
            <p className="mt-1 text-[1.6rem] font-bold text-current">{card.value}</p>
            <p className="text-[11px] text-current opacity-80">{card.helper}</p>
          </div>
        ))}
      </div>

      {kpis && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="ds-kpi-card ds-kpi-card--danger">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-current opacity-85">
              <ShieldAlert className="h-4 w-4" /> NC recorrente
            </p>
            <p className="mt-2 text-[1.6rem] font-bold text-current">{kpis.lagging.recurring_nc}</p>
          </div>
          <div className="ds-kpi-card ds-kpi-card--warning">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-current opacity-85">
              <Siren className="h-4 w-4" /> Incidentes
            </p>
            <p className="mt-2 text-[1.6rem] font-bold text-current">{kpis.lagging.incidents}</p>
          </div>
          <div className="ds-kpi-card ds-kpi-card--accent">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-current opacity-85">
              <Timer className="h-4 w-4" /> PT bloqueadas
            </p>
            <p className="mt-2 text-[1.6rem] font-bold text-current">{kpis.lagging.blocked_pt}</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card tone="elevated">
          <CardHeader>
            <CardTitle className="text-base">Tendência de risco</CardTitle>
            <CardDescription>Score agregado por mês para leitura de inclinação do risco.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExecutiveRiskTrendChart data={kpis?.trends.risk || []} />
          </CardContent>
        </Card>

        <Card tone="elevated">
          <CardHeader>
            <CardTitle className="text-base">Não conformidades por mês</CardTitle>
            <CardDescription>Evolução mensal de desvios críticos e reincidências.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExecutiveNcTrendChart data={kpis?.trends.nc || []} />
          </CardContent>
        </Card>
      </div>

      <Card tone="elevated">
        <CardHeader>
          <CardTitle className="text-base">Heatmap por obra</CardTitle>
          <CardDescription>Recorte por site com risco médio, NCs e aderência de treinamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {heatmap.map((item) => (
              <div key={item.site_id} className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-3.5">
                <p className="text-[13px] font-semibold text-[var(--ds-color-text-primary)]">{item.site_name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--ds-color-text-muted)]">Risco médio</span>
                  <Badge variant={scoreVariant(item.risk_score)}>
                    {item.risk_score.toFixed(1)}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-[var(--ds-color-text-secondary)]">
                  NC: {item.nc_count ?? 0} • Compliance: {(item.training_compliance ?? 0).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card tone="elevated">
        <CardHeader>
          <CardTitle className="text-base">Painel de alertas</CardTitle>
          <CardDescription>Sinais de atenção imediata para coordenação de obra e liderança SST.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(kpis?.alerts || []).map((alert) => (
              <div key={alert.id} className="flex items-start gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-warning)]/18 bg-[var(--ds-color-warning-subtle)] p-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--ds-color-warning)]" />
                <div>
                  <p className="text-[13px] text-[var(--ds-color-text-primary)]">{alert.message}</p>
                  <p className="text-[11px] text-[var(--ds-color-text-muted)]">
                    {safeToLocaleString(alert.created_at, 'pt-BR', undefined, '—')}
                  </p>
                </div>
              </div>
            ))}
            {(kpis?.alerts || []).length === 0 && (
              <p className="text-sm text-[var(--ds-color-text-muted)]">Nenhum alerta pendente.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutivePill({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: string;
  variant?: 'neutral' | 'warning' | 'info';
}) {
  const tone =
    variant === 'warning'
      ? 'border-[color:var(--ds-color-warning)]/20 bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]'
      : variant === 'info'
        ? 'border-[color:var(--ds-color-info)]/20 bg-[var(--ds-color-info-subtle)] text-[var(--ds-color-info)]'
        : 'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/28 text-[var(--ds-color-text-secondary)]';

  return (
    <div className={`rounded-full border px-3 py-1.5 ${tone}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="ml-2 text-[13px] font-semibold">{value}</span>
    </div>
  );
}
