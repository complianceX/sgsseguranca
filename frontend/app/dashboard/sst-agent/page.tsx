'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bot, FileText, ClipboardCheck, ListChecks, MessageSquareText, Sparkles, Loader2 } from 'lucide-react';
import { SophieStatusCard } from '@/components/SophieStatusCard';
import { isAiEnabled, isSophieAutomationPhase1Enabled } from '@/lib/featureFlags';
import { sophieService, SophieHistoryItem } from '@/services/sophieService';

const quickActions = [
  {
    title: 'APR Assistida',
    description: 'SOPHIE sugere riscos e EPIs para acelerar emissão da APR.',
    href: '/dashboard/aprs/new',
    icon: FileText,
  },
  {
    title: 'PT Assistida',
    description: 'SOPHIE analisa criticidade e recomenda controles de liberação.',
    href: '/dashboard/pts/new',
    icon: ClipboardCheck,
  },
  {
    title: 'Checklist Assistido',
    description: 'SOPHIE gera checklist técnico baseado no contexto da atividade.',
    href: '/dashboard/checklists/new',
    icon: ListChecks,
  },
  {
    title: 'DDS Assistido',
    description: 'SOPHIE cria conteúdo prático de DDS para uso em campo.',
    href: '/dashboard/dds/new',
    icon: MessageSquareText,
  },
] as const;

export default function SstAgentPage() {
  const aiEnabled = isAiEnabled();
  const phase1Enabled = isSophieAutomationPhase1Enabled();
  const [history, setHistory] = useState<SophieHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!aiEnabled || !phase1Enabled) return;
      try {
        setLoadingHistory(true);
        const data = await sophieService.getHistory(12);
        if (!active) return;
        setHistory(Array.isArray(data) ? data : []);
      } catch {
        if (active) setHistory([]);
      } finally {
        if (active) setLoadingHistory(false);
      }
    }

    void loadHistory();
    return () => {
      active = false;
    };
  }, [aiEnabled, phase1Enabled]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [history],
  );

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-6 shadow-[var(--ds-shadow-sm)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[image:var(--ds-gradient-brand)] text-white shadow-[var(--ds-shadow-sm)]">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ds-color-text-primary)]">SOPHIE</h1>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Assistente central de SST para apoio operacional, conformidade, análise técnica e decisões com prudência.
            </p>
          </div>
        </div>
      </section>

      {phase1Enabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Automação Assistida Fase 1</h2>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            Rascunhos automáticos com validação humana antes da decisão final.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 transition-all hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/40 hover:shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{item.title}</p>
                      <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {!aiEnabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-5 text-[var(--ds-color-warning)] shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4.5 w-4.5" />
            <div>
              <p className="text-sm font-semibold">SOPHIE está desativada neste ambiente.</p>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Defina <code>NEXT_PUBLIC_FEATURE_AI_ENABLED=true</code> no frontend para habilitar a experiência completa.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {aiEnabled && phase1Enabled ? (
        <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Trilha de Auditoria da SOPHIE</h2>
            {loadingHistory ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--ds-color-text-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Atualizando
              </span>
            ) : null}
          </div>
          {sortedHistory.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ds-color-text-secondary)]">
              Ainda não há interações registradas para este usuário/tenant.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedHistory.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--ds-color-text-primary)]">
                      {item.question || 'Interação SOPHIE'}
                    </p>
                    <span className="text-[11px] text-[var(--ds-color-text-muted)]">
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[var(--ds-color-text-secondary)]">
                    <span>Status: {item.status}</span>
                    <span>Confiança: {item.confidence || 'n/a'}</span>
                    <span>Latência: {item.latency_ms ?? 0}ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <SophieStatusCard />
    </div>
  );
}
