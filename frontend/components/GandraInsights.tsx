'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle, Info, Loader2 } from 'lucide-react';
import { aiService } from '@/services/aiService';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StatusPill } from './ui/status-pill';
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
  const aiEnabled = isAiEnabled();

  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(aiEnabled);

  useEffect(() => {
    if (!aiEnabled) {
      setLoading(false);
      return;
    }

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
  }, [aiEnabled]);

  if (!aiEnabled) return null;

  if (loading) {
    return (
      <div className="ds-dashboard-panel flex h-48 items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--ds-color-action-primary)]" />
          <p className="text-sm font-medium text-[var(--ds-color-text-muted)]">SOPHIE analisando dados...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ds-dashboard-panel overflow-hidden p-5">
        <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] pb-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">SOPHIE</h2>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              A assistente ainda nao conseguiu consolidar os insights deste ambiente.
            </p>
          </div>
          <StatusPill tone="warning">
            sincronizacao pendente
          </StatusPill>
        </div>

        <div className="px-0 pb-0 pt-4">
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
              Abrir SOPHIE <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-dashboard-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-5 py-4">
        <div className="flex items-center space-x-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[var(--ds-color-text-primary)]">SOPHIE</h2>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">Sintetiza tendências, riscos e pendências operacionais.</p>
          </div>
        </div>
        <StatusPill tone="info">
          <Sparkles className="h-3 w-3" />
          SOPHIE ativa
        </StatusPill>
      </div>

      <div className="p-5">
        <p className="mb-5 text-sm leading-relaxed text-[var(--ds-color-text-secondary)]">
          {data.summary}
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.insights.map((insight, index) => (
            <div
              key={index}
              className={cn(
                'group relative flex flex-col justify-between rounded-xl border p-4 transition-all hover:border-[var(--ds-color-action-primary)]/22',
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
                  'flex items-center text-xs font-semibold transition-all group-hover:translate-x-0.5',
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
      </div>
    </div>
  );
}
