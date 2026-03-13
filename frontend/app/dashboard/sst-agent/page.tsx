'use client';

import { Bot, Sparkles } from 'lucide-react';
import { SophieStatusCard } from '@/components/SophieStatusCard';
import { isAiEnabled } from '@/lib/featureFlags';

export default function SstAgentPage() {
  const aiEnabled = isAiEnabled();

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

      <SophieStatusCard />
    </div>
  );
}
