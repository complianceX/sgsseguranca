'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { sitesService } from '@/services/sitesService';
import { Map } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface RiskCell {
  categoria: string;
  prob: number;
  sev: number;
  count: number;
}

interface Site {
  id: string;
  nome: string;
}

function getCellColor(score: number) {
  if (score <= 4) return 'bg-green-100 text-green-800';
  if (score <= 9) return 'bg-yellow-100 text-yellow-800';
  if (score <= 16) return 'bg-orange-200 text-orange-900';
  return 'bg-red-200 text-red-900';
}

function getCellBorderColor(score: number) {
  if (score <= 4) return 'border-green-300';
  if (score <= 9) return 'border-yellow-300';
  if (score <= 16) return 'border-orange-400';
  return 'border-red-400';
}

export default function RiskMapPage() {
  const [matrix, setMatrix] = useState<RiskCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [filterSite, setFilterSite] = useState('');

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterSite ? { site_id: filterSite } : {};
      const res = await api.get('/aprs/risks/matrix', { params });
      setMatrix(res.data.matrix ?? []);
    } catch {
      setMatrix([]);
    } finally {
      setLoading(false);
    }
  }, [filterSite]);

  useEffect(() => { loadMatrix(); }, [loadMatrix]);

  useEffect(() => {
    sitesService.findAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as { data: Site[] }).data ?? [];
      setSites(list);
    }).catch(() => {});
  }, []);

  // Constrói um mapa prob × sev → { count, categorias }
  const cellMap: Record<string, { count: number; categorias: string[] }> = {};
  for (const item of matrix) {
    const key = `${item.prob}_${item.sev}`;
    if (!cellMap[key]) cellMap[key] = { count: 0, categorias: [] };
    cellMap[key].count += item.count;
    if (item.categoria && !cellMap[key].categorias.includes(item.categoria)) {
      cellMap[key].categorias.push(item.categoria);
    }
  }

  // Riscos por categoria para o gráfico
  const categoryData: Record<string, number> = {};
  for (const item of matrix) {
    const cat = item.categoria ?? 'Outros';
    categoryData[cat] = (categoryData[cat] ?? 0) + item.count;
  }
  const chartData = Object.entries(categoryData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalRiscos = matrix.reduce((acc, m) => acc + m.count, 0);
  const highRisks = matrix.filter((m) => (m.prob * m.sev) >= 17).reduce((a, m) => a + m.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
              <Map className="h-5 w-5 text-orange-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mapa de Risco</h1>
              <p className="text-sm text-gray-500">Matriz de probabilidade × severidade por APR</p>
            </div>
          </div>
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
          >
            <option value="">Todas as obras</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Total de Riscos</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalRiscos}</p>
        </div>
        <div className="rounded-xl border bg-red-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-red-600 uppercase">Risco Alto/Crítico</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{highRisks}</p>
          <p className="text-xs text-red-500">Score ≥ 17</p>
        </div>
        <div className="rounded-xl border bg-orange-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-orange-600 uppercase">Categorias</p>
          <p className="mt-1 text-3xl font-bold text-orange-700">{chartData.length}</p>
        </div>
      </div>

      {/* Matriz + Gráfico */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Matriz 5×5 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-800">Matriz Probabilidade × Severidade</h2>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Labels eixo X */}
              <div className="mb-1 flex">
                <div className="w-20" />
                {[1, 2, 3, 4, 5].map((sev) => (
                  <div key={sev} className="flex-1 text-center text-xs font-semibold text-gray-500">
                    S{sev}
                  </div>
                ))}
              </div>
              {/* Legenda X */}
              <div className="mb-3 flex">
                <div className="w-20 text-right pr-2 text-xs text-gray-400">Prob ↓ / Sev →</div>
                <div className="flex-1" />
              </div>

              {/* Grid: probabilidade de 5 a 1 (linha de cima = alta) */}
              {[5, 4, 3, 2, 1].map((prob) => (
                <div key={prob} className="flex items-center mb-1">
                  <div className="w-20 text-right pr-3 text-xs font-semibold text-gray-500">
                    P{prob}
                  </div>
                  {[1, 2, 3, 4, 5].map((sev) => {
                    const score = prob * sev;
                    const cell = cellMap[`${prob}_${sev}`];
                    return (
                      <div
                        key={sev}
                        className={`flex-1 m-0.5 flex h-12 flex-col items-center justify-center rounded border text-xs font-bold ${getCellColor(score)} ${getCellBorderColor(score)}`}
                        title={cell?.categorias.join(', ') ?? `Score ${score}`}
                      >
                        <span className="text-base leading-none">{cell?.count ?? ''}</span>
                        <span className="text-[9px] opacity-60">{score}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Legenda de cores */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-green-200 border border-green-300" />
                  Baixo (1-4)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-yellow-200 border border-yellow-300" />
                  Médio (5-9)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-orange-200 border border-orange-400" />
                  Alto (10-16)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-3 w-3 rounded bg-red-200 border border-red-400" />
                  Crítico (17-25)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* BarChart por categoria */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-gray-800">Riscos por Categoria</h2>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              Nenhum risco encontrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="Riscos" fill="#f97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
