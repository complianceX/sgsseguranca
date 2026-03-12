'use client';

import { useEffect, useState } from 'react';
import { Bot, BrainCircuit, Camera, Loader2, ShieldCheck } from 'lucide-react';
import { sophieService } from '@/services/sophieService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { isAiEnabled } from '@/lib/featureFlags';

type SophieStatus = {
  agent: {
    provider: string;
    imageAnalysisEnabled: boolean;
    localFallbackEnabled: boolean;
  };
  knowledgeBase: {
    version: string;
  };
};

function formatProvider(provider: string) {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'anthropic':
      return 'Anthropic';
    case 'gemini':
      return 'Gemini';
    case 'local':
      return 'SOPHIE Local';
    case 'stub':
      return 'Demonstracao';
    default:
      return provider;
  }
}

export function SophieStatusMiniCard() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SophieStatus | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!isAiEnabled()) {
        setLoading(false);
        return;
      }
      try {
        const data = await sophieService.getStatus();
        if (!active) return;
        setStatus(data as SophieStatus);
      } catch (error) {
        console.error('Erro ao carregar status resumido da SOPHIE:', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!isAiEnabled()) return null;

  return (
    <Card tone="elevated" padding="lg" className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[image:var(--ds-gradient-brand)] text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">SOPHIE</CardTitle>
            <CardDescription>Status operacional da assistente no ambiente atual.</CardDescription>
          </div>
        </div>
        <Badge variant="accent" className="text-[10px] uppercase tracking-[0.12em]">
          online
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-[var(--ds-color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando SOPHIE...
          </div>
        ) : status ? (
          <>
            <div className="grid gap-2">
              <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Provider
                </div>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {formatProvider(status.agent.provider)}
                </p>
                <p className="text-xs text-[var(--ds-color-text-muted)]">
                  Assistente central pronta para apoiar fluxos técnicos e operacionais.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                    <Camera className="h-3.5 w-3.5" />
                    Imagens
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {status.agent.imageAnalysisEnabled ? 'Ativas' : 'Indisponiveis'}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Base local
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {status.agent.localFallbackEnabled ? 'Ativa' : 'Desativada'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-[var(--ds-color-text-muted)]">
              KB {status.knowledgeBase.version} pronta para apoiar chat, analises e automacoes.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-[color:var(--ds-color-warning)]/25 bg-[var(--ds-color-warning-subtle)] p-3 text-sm text-[var(--ds-color-text-secondary)]">
            Nao foi possivel carregar o status da SOPHIE.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
