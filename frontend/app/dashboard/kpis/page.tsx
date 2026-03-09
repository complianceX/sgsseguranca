'use client';

import { useState, useEffect } from 'react';
import { catsService } from '@/services/catsService';
import { correctiveActionsService } from '@/services/correctiveActionsService';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { trainingsService } from '@/services/trainingsService';
import { BarChart2 } from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

const TOOLTIP_STYLE = {
  borderRadius: 16,
  border: '1px solid var(--ds-color-border-subtle)',
  background: 'var(--ds-color-surface-elevated)',
  color: 'var(--ds-color-text-primary)',
};

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="border-b border-[var(--ds-color-border-subtle)] pb-2">
      <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">{label}</h2>
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
      <p className="text-xs font-medium uppercase text-[var(--ds-color-text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold text-[var(--ds-color-text-primary)]">{value}</p>
    </div>
  );
}

export default function KpisPage() {
  const [catStats, setCatStats] = useState<{
    total: number;
    fatalCount: number;
    openCount: number;
    byTipo: Record<string, number>;
    byGravidade: Record<string, number>;
    byMonth: { month: string; total: number }[];
  } | null>(null);

  const [caSummary, setCaSummary] = useState<{
    total: number;
    open: number;
    inProgress: number;
    done: number;
    overdue: number;
  } | null>(null);

  const [caSlaBySite, setCaSlaBySite] = useState<
    { site: string; total: number; overdue: number; criticalOpen: number }[]
  >([]);

  const [ncMonthly, setNcMonthly] = useState<{ mes: string; total: number }[]>([]);

  const [trainingSummary, setTrainingSummary] = useState<{
    total: number;
    expired: number;
    expiringSoon: number;
    valid: number;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      catsService.getStatistics(),
      correctiveActionsService.findSummary(),
      correctiveActionsService.getSlaBySite(),
      nonConformitiesService.getMonthlyAnalytics(),
      trainingsService.getExpirySummary(),
    ]).then(([cats, caSum, caSite, nc, training]) => {
      if (cats.status === 'fulfilled') setCatStats(cats.value);
      if (caSum.status === 'fulfilled') setCaSummary(caSum.value);
      if (caSite.status === 'fulfilled') setCaSlaBySite(caSite.value);
      if (nc.status === 'fulfilled') setNcMonthly(nc.value);
      if (training.status === 'fulfilled') setTrainingSummary(training.value);
      setLoading(false);
    });
  }, []);

  const catByTipoChart = Object.entries(catStats?.byTipo ?? {}).map(([key, value]) => ({
    name: TIPO_LABEL[key] ?? key,
    count: value,
  }));

  const catByGravidadeChart = Object.entries(catStats?.byGravidade ?? {}).map(([key, value]) => ({
    name: GRAVIDADE_LABEL[key] ?? key,
    count: value,
    fill: GRAVIDADE_COLOR[key] ?? 'var(--ds-color-info)',
  }));

  const conformidadeCa = caSummary ? Math.round((caSummary.done / Math.max(caSummary.total, 1)) * 100) : 0;

  const trainingChart = trainingSummary
    ? [
        { name: 'Em Dia', count: trainingSummary.valid, fill: 'var(--ds-color-success)' },
        { name: 'Vencendo', count: trainingSummary.expiringSoon, fill: 'var(--ds-color-warning)' },
        { name: 'Vencidos', count: trainingSummary.expired, fill: 'var(--ds-color-danger)' },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card tone="elevated">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">KPIs SST</h1>
            <p className="text-sm text-[var(--ds-color-text-muted)]">Indicadores de Segurança e Saúde no Trabalho</p>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <SectionTitle label="Acidentabilidade (CATs)" />
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total de CATs" value={catStats?.total ?? 0} />
          <KpiCard label="Graves / Fatais" value={catStats?.fatalCount ?? 0} tone="danger" />
          <KpiCard label="Em Aberto" value={catStats?.openCount ?? 0} tone="warning" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-sm">CATs por Mês (últimos 12 meses)</CardTitle>
            </CardHeader>
            <CardContent>
              {catStats?.byMonth && catStats.byMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={catStats.byMonth}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="total" stroke="var(--ds-color-action-primary)" strokeWidth={2.5} dot={false} name="CATs" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">Sem dados</div>
              )}
            </CardContent>
          </Card>

          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-sm">Por Gravidade</CardTitle>
            </CardHeader>
            <CardContent>
              {catByGravidadeChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={catByGravidadeChart} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="CATs" radius={[0, 6, 6, 0]}>
                      {catByGravidadeChart.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">Sem dados</div>
              )}
            </CardContent>
          </Card>

          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-sm">Por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {catByTipoChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={catByTipoChart} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} width={100} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="CATs" fill="var(--ds-color-info)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">Sem dados</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <SectionTitle label="Não Conformidades" />
        <Card tone="elevated">
          <CardHeader>
            <CardTitle className="text-sm">NCs por Mês (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            {ncMonthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={ncMonthly.map((item) => ({ ...item, name: item.mes }))}>
                  <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="total" stroke="var(--ds-color-warning)" strokeWidth={2.5} dot={false} name="NCs" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <SectionTitle label="Ações Corretivas" />
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total" value={caSummary?.total ?? 0} />
          <KpiCard label="Vencidas" value={caSummary?.overdue ?? 0} tone="danger" />
          <KpiCard label="Taxa Conformidade" value={`${conformidadeCa}%`} tone="success" />
        </div>
        {caSlaBySite.length > 0 && (
          <Card tone="elevated">
            <CardHeader>
              <CardTitle className="text-sm">Conformidade por Obra</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={caSlaBySite} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="site" tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="total" name="Total" fill="var(--ds-color-info)" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="overdue" name="Vencidas" fill="var(--ds-color-danger)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <SectionTitle label="Treinamentos" />
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Total" value={trainingSummary?.total ?? 0} />
          <KpiCard label="Em Dia" value={trainingSummary?.valid ?? 0} tone="success" />
          <KpiCard label="Vencendo (30d)" value={trainingSummary?.expiringSoon ?? 0} tone="warning" />
          <KpiCard label="Vencidos" value={trainingSummary?.expired ?? 0} tone="danger" />
        </div>
        {trainingChart.length > 0 && (
          <Card tone="elevated">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm">Distribuição de Status</CardTitle>
                <CardDescription>Panorama de validade dos treinamentos.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="success">Em Dia</Badge>
                <Badge variant="warning">Vencendo</Badge>
                <Badge variant="danger">Vencidos</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={trainingChart} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Qtd" radius={[0, 6, 6, 0]}>
                    {trainingChart.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
