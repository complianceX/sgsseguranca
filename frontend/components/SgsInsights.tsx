'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle, Info, Loader2, MessageSquare, FileText } from 'lucide-react';
import { aiService } from '@/services/aiService';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { StatusPill } from './ui/status-pill';
import { isAiEnabled } from '@/lib/featureFlags';
import { isTemporarilyVisibleDashboardRoute } from '@/lib/temporarilyHiddenModules';

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

export function SgsInsights() {
  const aiEnabled = isAiEnabled();

  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(aiEnabled);
  const visibleInsights = useMemo(
    () =>
      (data?.insights ?? []).filter((insight) =>
        isTemporarilyVisibleDashboardRoute(insight.action),
      ),
    [data],
  );
  const primaryInsight = useMemo(() => visibleInsights[0] ?? null, [visibleInsights]);
  const secondaryInsights = useMemo(() => visibleInsights.slice(1, 3), [visibleInsights]);
  const remainingInsights = Math.max(
    0,
    visibleInsights.length - (primaryInsight ? 1 : 0) - secondaryInsights.length,
  );

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
      <div className="ds-dashboard-panel flex min-h-[14rem] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--ds-color-action-primary)]" />
          <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">Leitura assistida em preparação</p>
          <p className="max-w-sm text-sm text-[var(--ds-color-text-muted)]">
            A SOPHIE está consolidando riscos, pendências e oportunidades de ação.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ds-dashboard-panel overflow-hidden p-5">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--ds-color-border-subtle)] pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              leitura assistida
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--ds-color-text-primary)]">SOPHIE indisponível neste carregamento</h2>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              O chat continua disponível, mas o resumo assistido não conseguiu consolidar os sinais do ambiente agora.
            </p>
          </div>
          <StatusPill tone="warning">
            sincronização pendente
          </StatusPill>
        </div>

        <div className="grid gap-3 pt-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4">
            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
              O resumo assistido depende do backend de IA e da permissão <code>can_use_ai</code>.
            </p>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Se a operação estiver normal, recarregue a página ou siga pelo workspace assistido para montar documentos com contexto.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/sst-agent"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
              >
                Abrir workspace assistido <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/dashboard/documentos/importar"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ds-color-action-primary)] hover:underline"
              >
                Importar PDF com IA <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-dashboard-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--ds-color-border-subtle)] px-5 py-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              leitura assistida
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--ds-color-text-primary)]">SOPHIE em modo síntese</h2>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{data.summary}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="info">
            <Sparkles className="h-3 w-3" />
            assistente ativa
          </StatusPill>
          <Link
            href="/dashboard/sst-agent"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/30 hover:bg-[var(--ds-color-primary-subtle)]"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Workspace assistido
          </Link>
          <Link
            href="/dashboard/documentos/importar"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-action-primary)] transition-colors hover:border-[var(--ds-color-action-primary)]/30 hover:bg-[var(--ds-color-primary-subtle)]"
          >
            <FileText className="h-3.5 w-3.5" />
            Importar PDF
          </Link>
        </div>
      </div>

      <div className="p-5">
        <div className="space-y-4">
          {primaryInsight ? (
            <div
              className={cn(
                'rounded-xl border px-4 py-4',
                primaryInsight.type === 'warning' &&
                'border-[color:var(--ds-color-warning)]/18 bg-[var(--ds-color-warning-subtle)]',
                primaryInsight.type === 'success' &&
                'border-[color:var(--ds-color-success)]/18 bg-[var(--ds-color-success-subtle)]',
                primaryInsight.type === 'info' &&
                'border-[color:var(--ds-color-info)]/18 bg-[var(--ds-color-info-subtle)]',
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {primaryInsight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-[var(--ds-color-warning)]" />}
                    {primaryInsight.type === 'success' && <CheckCircle className="h-4 w-4 text-[var(--ds-color-success)]" />}
                    {primaryInsight.type === 'info' && <Info className="h-4 w-4 text-[var(--ds-color-info)]" />}
                    <h3
                      className={cn(
                        'text-sm font-semibold',
                        primaryInsight.type === 'warning' && 'text-[var(--ds-color-warning)]',
                        primaryInsight.type === 'success' && 'text-[var(--ds-color-success)]',
                        primaryInsight.type === 'info' && 'text-[var(--ds-color-info)]',
                      )}
                    >
                      {primaryInsight.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ds-color-text-secondary)]">{primaryInsight.message}</p>
                </div>
                <Link
                  href={primaryInsight.action}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-color-action-primary)] transition-transform hover:translate-x-0.5"
                >
                  Abrir contexto
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : null}

          {secondaryInsights.length > 0 ? (
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                próximos sinais
              </p>
              <div className="mt-3 space-y-3">
                {secondaryInsights.map((insight, index) => (
                  <div key={`${insight.title}-${index}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{insight.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">{insight.message}</p>
                    </div>
                    <Link
                      href={insight.action}
                      className="shrink-0 text-xs font-semibold text-[var(--ds-color-action-primary)] hover:underline"
                    >
                      Abrir
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {remainingInsights > 0 ? (
          <p className="mt-4 text-xs font-medium text-[var(--ds-color-text-muted)]">
            +{remainingInsights} insight{remainingInsights > 1 ? 's' : ''} disponível{remainingInsights > 1 ? 'eis' : ''} no workspace assistido.
          </p>
        ) : null}
      </div>
    </div>
  );
}
