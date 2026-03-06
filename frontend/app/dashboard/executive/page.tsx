'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldAlert, Siren, Timer } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardService, DashboardHeatmapResponse, DashboardKpisResponse } from '@/services/dashboardService';

function scoreClass(score: number) {
  if (score >= 61) return 'bg-red-100 text-red-700';
  if (score >= 31) return 'bg-orange-100 text-orange-700';
  if (score >= 11) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function ExecutiveDashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpisResponse | null>(null);
  const [heatmap, setHeatmap] = useState<DashboardHeatmapResponse>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([dashboardService.getKpis(), dashboardService.getHeatmap()])
      .then(([kpiData, heatmapData]) => {
        setKpis(kpiData);
        setHeatmap(heatmapData);
      })
      .finally(() => setLoading(false));
  }, []);

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cockpit Executivo SST</h1>
        <p className="text-sm text-gray-500">Indicadores leading e lagging por obra.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {leadingCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-500">{card.helper}</p>
          </div>
        ))}
      </div>

      {kpis && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-red-50 p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-red-700">
              <ShieldAlert className="h-4 w-4" /> NC recorrente
            </p>
            <p className="mt-2 text-3xl font-bold text-red-700">{kpis.lagging.recurring_nc}</p>
          </div>
          <div className="rounded-xl border bg-orange-50 p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-orange-700">
              <Siren className="h-4 w-4" /> Incidentes
            </p>
            <p className="mt-2 text-3xl font-bold text-orange-700">{kpis.lagging.incidents}</p>
          </div>
          <div className="rounded-xl border bg-amber-50 p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-amber-700">
              <Timer className="h-4 w-4" /> PT bloqueadas
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-700">{kpis.lagging.blocked_pt}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">Tendência de risco</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={kpis?.trends.risk || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="risk_score" stroke="#2563eb" fill="#bfdbfe" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-gray-700">Não conformidades por mês</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={kpis?.trends.nc || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-gray-700">Heatmap por obra</p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {heatmap.map((item) => (
            <div key={item.site_id} className="rounded-lg border p-3">
              <p className="text-sm font-semibold text-gray-800">{item.site_name}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-gray-500">Risco médio</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreClass(item.risk_score)}`}>
                  {item.risk_score.toFixed(1)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                NC: {item.nc_count ?? 0} • Compliance: {(item.training_compliance ?? 0).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-gray-700">Painel de alertas</p>
        <div className="space-y-2">
          {(kpis?.alerts || []).map((alert) => (
            <div key={alert.id} className="flex items-start gap-2 rounded-md border border-amber-100 bg-amber-50 p-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
              <div>
                <p className="text-sm text-gray-800">{alert.message}</p>
                <p className="text-xs text-gray-500">
                  {new Date(alert.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
          {(kpis?.alerts || []).length === 0 && (
            <p className="text-sm text-gray-500">Nenhum alerta pendente.</p>
          )}
        </div>
      </div>
    </div>
  );
}
