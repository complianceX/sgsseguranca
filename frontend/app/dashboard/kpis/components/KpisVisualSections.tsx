'use client';

import dynamic from 'next/dynamic';
import { LazyChart } from '@/components/LazyChart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type CatStats = {
  total: number;
  fatalCount: number;
  openCount: number;
  byTipo: Record<string, number>;
  byGravidade: Record<string, number>;
  byMonth: { month: string; total: number }[];
};

type CorrectiveActionsSummary = {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  overdue: number;
};

type TrainingSummary = {
  total: number;
  expired: number;
  expiringSoon: number;
  valid: number;
};

export interface KpisVisualSectionsProps {
  catStats: CatStats | null;
  caSummary: CorrectiveActionsSummary | null;
  caSlaBySite: { site: string; total: number; overdue: number; criticalOpen: number }[];
  ncMonthly: { mes: string; total: number }[];
  trainingSummary: TrainingSummary | null;
}

const TIPO_LABEL: Record<string, string> = {
  tipico: 'Típico',
  trajeto: 'Trajeto',
  doenca_ocupacional: 'Doença Ocupacional',
  outros: 'Outros',
};

const GRAVIDADE_LABEL: Record<string, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  grave: 'Grave',
  fatal: 'Fatal',
};

const GRAVIDADE_COLOR: Record<string, string> = {
  leve: 'var(--ds-color-success)',
  moderada: 'var(--ds-color-warning)',
  grave: 'var(--ds-color-accent)',
  fatal: 'var(--ds-color-danger)',
};

const CatByMonthChart = dynamic(
  () => import('./KpiCharts').then((module) => module.CatByMonthChart),
  {
    ssr: false,
    loading: () => <LazyChart height={204} />,
  },
);

const CatByGravidadeChart = dynamic(
  () => import('./KpiCharts').then((module) => module.CatByGravidadeChart),
  {
    ssr: false,
    loading: () => <LazyChart height={204} />,
  },
);

const CatByTipoChart = dynamic(
  () => import('./KpiCharts').then((module) => module.CatByTipoChart),
  {
    ssr: false,
    loading: () => <LazyChart height={172} />,
  },
);

const NcMonthlyChart = dynamic(
  () => import('./KpiCharts').then((module) => module.NcMonthlyChart),
  {
    ssr: false,
    loading: () => <LazyChart height={204} />,
  },
);

const CaSlaBySiteChart = dynamic(
  () => import('./KpiCharts').then((module) => module.CaSlaBySiteChart),
  {
    ssr: false,
    loading: () => <LazyChart height={204} />,
  },
);

const TrainingStatusChart = dynamic(
  () => import('./KpiCharts').then((module) => module.TrainingStatusChart),
  {
    ssr: false,
    loading: () => <LazyChart height={152} />,
  },
);

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--ds-color-border-subtle)] pb-1.5">
      <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">{label}</h2>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = 'primary',
}: {
  label: string;
  value: number | string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const toneClass =
    tone === 'success'
      ? 'ds-kpi-card--success'
      : tone === 'warning'
        ? 'ds-kpi-card--warning'
        : tone === 'danger'
          ? 'ds-kpi-card--danger'
          : tone === 'accent'
            ? 'ds-kpi-card--accent'
            : 'ds-kpi-card--primary';

  return (
    <div className={`ds-kpi-card ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-current opacity-80">
        {label}
      </p>
      <p className="mt-1 text-[1.55rem] font-bold text-current">{value}</p>
    </div>
  );
}

export function KpisVisualSections({
  catStats,
  caSummary,
  caSlaBySite,
  ncMonthly,
  trainingSummary,
}: KpisVisualSectionsProps) {
  const catByTipoChart = Object.entries(catStats?.byTipo ?? {}).map(
    ([key, value]) => ({
      name: TIPO_LABEL[key] ?? key,
      count: value,
    }),
  );

  const catByGravidadeChart = Object.entries(catStats?.byGravidade ?? {}).map(
    ([key, value]) => ({
      name: GRAVIDADE_LABEL[key] ?? key,
      count: value,
      fill: GRAVIDADE_COLOR[key] ?? 'var(--ds-color-info)',
    }),
  );

  const conformidadeCa = caSummary
    ? Math.round((caSummary.done / Math.max(caSummary.total, 1)) * 100)
    : 0;

  const trainingChart = trainingSummary
    ? [
        {
          name: 'Em Dia',
          count: trainingSummary.valid,
          fill: 'var(--ds-color-success)',
        },
        {
          name: 'Vencendo',
          count: trainingSummary.expiringSoon,
          fill: 'var(--ds-color-warning)',
        },
        {
          name: 'Vencidos',
          count: trainingSummary.expired,
          fill: 'var(--ds-color-danger)',
        },
      ]
    : [];

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <SectionTitle label="Acidentabilidade (CATs)" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Total de CATs" value={catStats?.total ?? 0} />
          <KpiCard
            label="Graves / Fatais"
            value={catStats?.fatalCount ?? 0}
            tone="danger"
          />
          <KpiCard
            label="Em Aberto"
            value={catStats?.openCount ?? 0}
            tone="warning"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-base">CATs por mês</CardTitle>
              <CardDescription>Recorte móvel dos últimos 12 meses.</CardDescription>
            </CardHeader>
            <CardContent>
              {catStats?.byMonth && catStats.byMonth.length > 0 ? (
                <CatByMonthChart data={catStats.byMonth} />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>

          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-base">Por gravidade</CardTitle>
            </CardHeader>
            <CardContent>
              {catByGravidadeChart.length > 0 ? (
                <CatByGravidadeChart data={catByGravidadeChart} />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>

          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-base">Por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {catByTipoChart.length > 0 ? (
                <CatByTipoChart data={catByTipoChart} />
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">
                  Sem dados
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle label="Não Conformidades" />
        <Card tone="elevated">
          <CardHeader>
            <CardTitle className="text-base">NCs por mês</CardTitle>
            <CardDescription>
              Evolução mensal dos registros de não conformidade.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ncMonthly.length > 0 ? (
              <NcMonthlyChart data={ncMonthly} />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <SectionTitle label="Ações Corretivas" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Total" value={caSummary?.total ?? 0} />
          <KpiCard
            label="Vencidas"
            value={caSummary?.overdue ?? 0}
            tone="danger"
          />
          <KpiCard
            label="Taxa Conformidade"
            value={`${conformidadeCa}%`}
            tone="success"
          />
        </div>
        {caSlaBySite.length > 0 ? (
          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-base">Conformidade por obra</CardTitle>
              <CardDescription>Total x vencidas por site.</CardDescription>
            </CardHeader>
            <CardContent>
              <CaSlaBySiteChart data={caSlaBySite} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <SectionTitle label="Treinamentos" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total" value={trainingSummary?.total ?? 0} />
          <KpiCard
            label="Em Dia"
            value={trainingSummary?.valid ?? 0}
            tone="success"
          />
          <KpiCard
            label="Vencendo (30d)"
            value={trainingSummary?.expiringSoon ?? 0}
            tone="warning"
          />
          <KpiCard
            label="Vencidos"
            value={trainingSummary?.expired ?? 0}
            tone="danger"
          />
        </div>
        {trainingChart.length > 0 ? (
          <Card tone="elevated">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Distribuição de status
                </CardTitle>
                <CardDescription>
                  Panorama de validade dos treinamentos.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="success">Em Dia</Badge>
                <Badge variant="warning">Vencendo</Badge>
                <Badge variant="danger">Vencidos</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <TrainingStatusChart data={trainingChart} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
