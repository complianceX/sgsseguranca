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
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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

function getCellTone(score: number): 'success' | 'warning' | 'accent' | 'danger' {
  if (score <= 4) return 'success';
  if (score <= 9) return 'warning';
  if (score <= 16) return 'accent';
  return 'danger';
}

function getCellClass(score: number) {
  const tone = getCellTone(score);
  if (tone === 'success') {
    return 'border-[var(--ds-color-success)]/35 bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]';
  }
  if (tone === 'warning') {
    return 'border-[var(--ds-color-warning)]/35 bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]';
  }
  if (tone === 'accent') {
    return 'border-[var(--ds-color-accent)]/35 bg-[var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]';
  }
  return 'border-[var(--ds-color-danger)]/35 bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)]';
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

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  useEffect(() => {
    sitesService
      .findAll()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as { data: Site[] }).data ?? [];
        setSites(list);
      })
      .catch(() => {});
  }, []);

  const cellMap: Record<string, { count: number; categorias: string[] }> = {};
  for (const item of matrix) {
    const key = `${item.prob}_${item.sev}`;
    if (!cellMap[key]) cellMap[key] = { count: 0, categorias: [] };
    cellMap[key].count += item.count;
    if (item.categoria && !cellMap[key].categorias.includes(item.categoria)) {
      cellMap[key].categorias.push(item.categoria);
    }
  }

  const categoryData: Record<string, number> = {};
  for (const item of matrix) {
    const cat = item.categoria ?? 'Outros';
    categoryData[cat] = (categoryData[cat] ?? 0) + item.count;
  }
  const chartData = Object.entries(categoryData)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalRiscos = matrix.reduce((acc, m) => acc + m.count, 0);
  const highRisks = matrix.filter((m) => m.prob * m.sev >= 17).reduce((a, m) => a + m.count, 0);

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ds-color-accent-subtle)] text-[var(--ds-color-accent)]">
              <Map className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Mapa de Risco</h1>
              <p className="text-sm text-[var(--ds-color-text-muted)]">Matriz de probabilidade × severidade por APR</p>
            </div>
          </div>
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
          >
            <option value="">Todas as obras</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <div className="ds-kpi-card ds-kpi-card--primary">
          <p className="text-xs font-medium uppercase text-[var(--ds-color-text-muted)]">Total de Riscos</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ds-color-text-primary)]">{totalRiscos}</p>
        </div>
        <div className="ds-kpi-card ds-kpi-card--danger">
          <p className="text-xs font-medium uppercase text-[var(--ds-color-danger)]">Risco Alto/Crítico</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ds-color-text-primary)]">{highRisks}</p>
          <p className="text-xs text-[var(--ds-color-text-secondary)]">Score ≥ 17</p>
        </div>
        <div className="ds-kpi-card ds-kpi-card--accent">
          <p className="text-xs font-medium uppercase text-[var(--ds-color-accent)]">Categorias</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ds-color-text-primary)]">{chartData.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card tone="elevated" padding="lg">
          <CardHeader className="mb-4 px-0 pt-0">
            <CardTitle className="text-base">Matriz Probabilidade × Severidade</CardTitle>
            <CardDescription>Distribuição dos riscos por score operacional.</CardDescription>
          </CardHeader>

          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ds-color-accent)] border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="mb-1 flex">
                <div className="w-20" />
                {[1, 2, 3, 4, 5].map((sev) => (
                  <div key={sev} className="flex-1 text-center text-xs font-semibold text-[var(--ds-color-text-muted)]">
                    S{sev}
                  </div>
                ))}
              </div>
              <div className="mb-3 flex">
                <div className="w-20 pr-2 text-right text-xs text-[var(--ds-color-text-muted)]">Prob ↓ / Sev →</div>
                <div className="flex-1" />
              </div>

              {[5, 4, 3, 2, 1].map((prob) => (
                <div key={prob} className="mb-1 flex items-center">
                  <div className="w-20 pr-3 text-right text-xs font-semibold text-[var(--ds-color-text-muted)]">P{prob}</div>
                  {[1, 2, 3, 4, 5].map((sev) => {
                    const score = prob * sev;
                    const cell = cellMap[`${prob}_${sev}`];
                    return (
                      <div
                        key={sev}
                        className={`m-0.5 flex h-12 flex-1 flex-col items-center justify-center rounded border text-xs font-bold ${getCellClass(score)}`}
                        title={cell?.categorias.join(', ') ?? `Score ${score}`}
                      >
                        <span className="text-base leading-none">{cell?.count ?? ''}</span>
                        <span className="text-[9px] opacity-60">{score}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant="success">Baixo (1-4)</Badge>
                <Badge variant="warning">Médio (5-9)</Badge>
                <Badge variant="accent">Alto (10-16)</Badge>
                <Badge variant="danger">Crítico (17-25)</Badge>
              </div>
            </div>
          )}
        </Card>

        <Card tone="elevated" padding="lg">
          <CardHeader className="mb-4 px-0 pt-0">
            <CardTitle className="text-base">Riscos por Categoria</CardTitle>
          </CardHeader>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ds-color-accent)] border-t-transparent" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--ds-color-text-muted)]">Nenhum risco encontrado</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
                <CartesianGrid stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }} width={80} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: '1px solid var(--ds-color-border-subtle)',
                    background: 'var(--ds-color-surface-elevated)',
                    color: 'var(--ds-color-text-primary)',
                  }}
                />
                <Bar dataKey="count" name="Riscos" fill="var(--ds-color-accent)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
