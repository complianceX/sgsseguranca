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
  leve: '#86efac',
  moderada: '#fde68a',
  grave: '#fdba74',
  fatal: '#fca5a5',
};

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="border-b border-gray-200 pb-2">
      <h2 className="text-lg font-bold text-gray-800">{label}</h2>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${color ?? 'bg-white'}`}>
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
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

  // Dados derivados
  const catByTipoChart = Object.entries(catStats?.byTipo ?? {}).map(([k, v]) => ({
    name: TIPO_LABEL[k] ?? k,
    count: v,
  }));

  const catByGravidadeChart = Object.entries(catStats?.byGravidade ?? {}).map(([k, v]) => ({
    name: GRAVIDADE_LABEL[k] ?? k,
    count: v,
    fill: GRAVIDADE_COLOR[k] ?? '#e5e7eb',
  }));

  const conformidadeCa = caSummary
    ? Math.round((caSummary.done / Math.max(caSummary.total, 1)) * 100)
    : 0;

  const trainingChart = trainingSummary
    ? [
        { name: 'Em Dia', count: trainingSummary.valid, fill: '#86efac' },
        { name: 'Vencendo', count: trainingSummary.expiringSoon, fill: '#fde68a' },
        { name: 'Vencidos', count: trainingSummary.expired, fill: '#fca5a5' },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <BarChart2 className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">KPIs SST</h1>
            <p className="text-sm text-gray-500">Indicadores de Segurança e Saúde no Trabalho</p>
          </div>
        </div>
      </div>

      {/* Seção 1: Acidentabilidade (CATs) */}
      <div className="space-y-4">
        <SectionTitle label="Acidentabilidade (CATs)" />
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total de CATs" value={catStats?.total ?? 0} />
          <KpiCard label="Graves / Fatais" value={catStats?.fatalCount ?? 0} color="bg-red-50" />
          <KpiCard label="Em Aberto" value={catStats?.openCount ?? 0} color="bg-amber-50" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">CATs por Mês (últimos 12 meses)</p>
            {catStats?.byMonth && catStats.byMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={catStats.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} name="CATs" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">Sem dados</div>
            )}
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Por Gravidade</p>
            {catByGravidadeChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={catByGravidadeChart} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="CATs" radius={[0, 4, 4, 0]}>
                    {catByGravidadeChart.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">Sem dados</div>
            )}
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Por Tipo</p>
            {catByTipoChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={catByTipoChart} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" name="CATs" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">Sem dados</div>
            )}
          </div>
        </div>
      </div>

      {/* Seção 2: Não Conformidades */}
      <div className="space-y-4">
        <SectionTitle label="Não Conformidades" />
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">NCs por Mês (últimos 12 meses)</p>
          {ncMonthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={ncMonthly.map((d) => ({ ...d, name: d.mes }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2} dot={false} name="NCs" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">Sem dados</div>
          )}
        </div>
      </div>

      {/* Seção 3: Ações Corretivas */}
      <div className="space-y-4">
        <SectionTitle label="Ações Corretivas" />
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total" value={caSummary?.total ?? 0} />
          <KpiCard label="Vencidas" value={caSummary?.overdue ?? 0} color="bg-red-50" />
          <KpiCard label="Taxa Conformidade" value={`${conformidadeCa}%`} color="bg-green-50" />
        </div>
        {caSlaBySite.length > 0 && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Conformidade por Obra</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={caSlaBySite} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="site" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#93c5fd" radius={[0, 4, 4, 0]} />
                <Bar dataKey="overdue" name="Vencidas" fill="#fca5a5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Seção 4: Treinamentos */}
      <div className="space-y-4">
        <SectionTitle label="Treinamentos" />
        <div className="grid grid-cols-4 gap-4">
          <KpiCard label="Total" value={trainingSummary?.total ?? 0} />
          <KpiCard label="Em Dia" value={trainingSummary?.valid ?? 0} color="bg-green-50" />
          <KpiCard label="Vencendo (30d)" value={trainingSummary?.expiringSoon ?? 0} color="bg-amber-50" />
          <KpiCard label="Vencidos" value={trainingSummary?.expired ?? 0} color="bg-red-50" />
        </div>
        {trainingChart.length > 0 && (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-gray-700">Distribuição de Status</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trainingChart} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="Qtd" radius={[0, 4, 4, 0]}>
                  {trainingChart.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
