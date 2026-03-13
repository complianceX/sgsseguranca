'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { sophieService } from '@/services/sophieService';
import { isAiEnabled } from '@/lib/featureFlags';

type SophieStatus = {
  agent: {
    provider: string;
    officialProvider?: string;
    configured?: boolean;
    runtimeMode?: 'online' | 'degraded' | string;
    historyDefaultDays: number;
    historyMaxDays: number;
    historyMaxLimit: number;
    imageAnalysisEnabled: boolean;
    externalProviderEnabled: boolean;
    localFallbackEnabled: boolean;
  };
  knowledgeBase: {
    name: string;
    version: string;
    updated_at: string;
  };
  capabilities: Record<string, boolean>;
};

function formatProvider(provider: string) {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'stub':
      return 'OpenAI indisponivel';
    default:
      return provider;
  }
}

function formatCapabilityLabel(key: string) {
  const labels: Record<string, string> = {
    insights: 'Insights',
    analyzeApr: 'Analise de APR',
    analyzePt: 'Analise de PT',
    analyzeChecklist: 'Analise de checklist',
    generateDds: 'Geracao de DDS',
    generateChecklist: 'Geracao de checklist',
    chat: 'Chat operacional',
    history: 'Historico',
    imageAnalysis: 'Analise de imagens',
    openAiProvider: 'OpenAI oficial',
    sstKnowledgeBase: 'Base tecnica SST',
  };
  return labels[key] || key;
}

export function SophieStatusCard() {
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
        console.error('Erro ao carregar status da SOPHIE:', error);
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
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">SOPHIE</h2>
            <p className="text-sm text-gray-500">
              Status operacional da SOPHIE no ambiente atual.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
          <Sparkles className="h-3.5 w-3.5" />
          ativa
        </span>
      </div>

      {loading ? (
        <div className="mt-5 flex min-h-40 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando status da SOPHIE...
          </div>
        </div>
      ) : status ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-700">
                <BrainCircuit className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Motor oficial
                </span>
              </div>
              <p className="text-base font-semibold text-slate-900">
                {formatProvider(status.agent.officialProvider || status.agent.provider)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {status.agent.configured
                  ? 'OpenAI conectada como motor oficial da SOPHIE neste ambiente.'
                  : 'OpenAI definida como motor oficial, mas ainda indisponivel neste ambiente.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-700">
                <Camera className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Analise visual
                </span>
              </div>
              <p className="text-base font-semibold text-slate-900">
                {status.agent.imageAnalysisEnabled ? 'Habilitada' : 'Indisponivel'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Leitura visual pronta para apoiar inspeções, evidências e análises técnicas.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-slate-700">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">
                  Base tecnica SST
                </span>
              </div>
              <p className="text-base font-semibold text-slate-900">
                {status.knowledgeBase.version ? 'Ativa' : 'Indisponivel'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                KB {status.knowledgeBase.version} · {status.knowledgeBase.updated_at}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Capacidades ativas
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(status.capabilities)
                .filter(([, enabled]) => enabled)
                .map(([key]) => (
                  <div
                    key={key}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {formatCapabilityLabel(key)}
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Nao foi possivel consultar o status da SOPHIE neste momento.
        </div>
      )}
    </div>
  );
}
