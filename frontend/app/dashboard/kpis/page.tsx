'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { catsService } from '@/services/catsService';
import { correctiveActionsService } from '@/services/correctiveActionsService';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { trainingsService } from '@/services/trainingsService';
import { BarChart2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const KpisVisualSections = dynamic(
  () =>
    import('./components/KpisVisualSections').then(
      (module) => module.KpisVisualSections,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} tone="elevated">
              <CardContent className="h-24 animate-pulse bg-[var(--ds-color-surface-muted)]/60" />
            </Card>
          ))}
        </div>
        <Card tone="elevated">
          <CardContent className="h-64 animate-pulse bg-[var(--ds-color-surface-muted)]/60" />
        </Card>
      </div>
    ),
  },
);

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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Card tone="elevated">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">KPIs SST</h1>
              <p className="text-sm text-[var(--ds-color-text-muted)]">Indicadores de Segurança e Saúde no Trabalho</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">Operação</Badge>
            <Badge variant="warning">Ações</Badge>
            <Badge variant="danger">Incidentes</Badge>
          </div>
        </div>
      </Card>

      <KpisVisualSections
        catStats={catStats}
        caSummary={caSummary}
        caSlaBySite={caSlaBySite}
        ncMonthly={ncMonthly}
        trainingSummary={trainingSummary}
      />
    </div>
  );
}
