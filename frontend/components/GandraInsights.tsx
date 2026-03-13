'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle, Info, Loader2 } from 'lucide-react';
import { aiService } from '@/services/aiService';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Card, CardContent, CardTitle, CardDescription } from './ui/card';
import { isAiEnabled } from '@/lib/featureFlags';

export interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

interface InsightsData {
  insights: Insight[];
  summary: string;
  timestamp: string;
}

export function GandraInsights() {
  if (!isAiEnabled()) return null;

  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInsights() {
      try {
        const result = await aiService.getInsights();
        setData(result);
      } catch (error) {
        console.error('Erro ao carregar insights da SOPHIE:', error);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, []);

  if (loading) {
    return (
      <Card tone="elevated" padding="lg" className="flex h-48 items-center justify-center">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--ds-color-action-primary)]" />
          <p className="text-sm font-medium text-[var(--ds-color-text-muted)]">SOPHIE analisando dados...</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card tone="elevated" padding="lg" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] pb-3">
          <div>
            <CardTitle className="text-base">SOPHIE Insights</CardTitle>
            <CardDescription>
              A assistente ainda nao conseguiu consolidar os insights deste ambiente.
            </CardDescription>
          </div>
          <Badge variant="warning" className="text-[10px] uppercase tracking-[0.12em]">
            sincronizacao pendente
          </Badge>
        </div>

        <CardContent className="px-0 pb-0 pt-4">
          <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
              A SOPHIE esta visivel, mas os insights nao retornaram neste carregamento.
            </p>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Verifique se o backend esta com <code>FEATURE_AI_ENABLED=true</code> e se o usuario possui a permissao <code>can_use_ai</code>.
            </p>
            <Link
              href="/dashboard/sst-agent"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
            >
              Abrir Central SOPHIE <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card tone="elevated" padding="none" interactive className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-5 py-3.5">
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--ds-gradient-brand)] text-white shadow-sm">
            <span className="text-base font-black italic">G</span>
          </div>
          <div>
            <CardTitle className="text-base">SOPHIE Insights</CardTitle>
            <CardDescription>Sintetiza tendências, riscos e pendências operacionais.</CardDescription>
          </div>
        </div>
        <Badge variant="accent" className="text-[10px] uppercase tracking-[0.12em]">
          <Sparkles className="h-3 w-3" />
          <span>SOPHIE ativa</span>
        </Badge>
      </div>

      <CardContent className="p-5">
        <p className="mb-5 text-sm leading-relaxed text-[var(--ds-color-text-secondary)]">
          {data.summary}
        </p>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {data.insights.map((insight, index) => (
            <div
              key={index}
              className={cn(
                'group relative flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:-translate-y-px',
                insight.type === 'warning' &&
                'border-[color:var(--ds-color-warning)]/18 bg-[var(--ds-color-warning-subtle)]',
                insight.type === 'success' &&
                'border-[color:var(--ds-color-success)]/18 bg-[var(--ds-color-success-subtle)]',
                insight.type === 'info' &&
                'border-[color:var(--ds-color-info)]/18 bg-[var(--ds-color-info-subtle)]',
              )}
            >
              <div className="mb-3.5">
                <div className="mb-2 flex items-center space-x-2">
                  {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-[var(--ds-color-warning)]" />}
                  {insight.type === 'success' && <CheckCircle className="h-4 w-4 text-[var(--ds-color-success)]" />}
                  {insight.type === 'info' && <Info className="h-4 w-4 text-[var(--ds-color-info)]" />}
                  <h3 className={cn(
                    'text-xs font-bold uppercase tracking-wider',
                    insight.type === 'warning' && 'text-[var(--ds-color-warning)]',
                    insight.type === 'success' && 'text-[var(--ds-color-success)]',
                    insight.type === 'info' && 'text-[var(--ds-color-info)]',
                  )}>
                    {insight.title}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
                  {insight.message}
                </p>
              </div>

              <Link
                href={insight.action}
                className={cn(
                  'flex items-center text-[11px] font-bold uppercase transition-all group-hover:translate-x-1',
                  insight.type === 'warning' && 'text-[var(--ds-color-warning)]',
                  insight.type === 'success' && 'text-[var(--ds-color-success)]',
                  insight.type === 'info' && 'text-[var(--ds-color-info)]',
                )}
              >
                Ver Detalhes <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
