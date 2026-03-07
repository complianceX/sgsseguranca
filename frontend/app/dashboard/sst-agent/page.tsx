'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, AlertTriangle, Info, CheckCircle, Loader2, History, X, ChevronRight } from 'lucide-react';
import { sstAgentService, SstChatResponse, ConversationMessage, SstHistoryItem } from '@/services/sstAgentService';

const CONFIDENCE_CONFIG = {
  high: { label: 'Alta', className: 'bg-green-100 text-green-800' },
  medium: { label: 'Média', className: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Baixa', className: 'bg-red-100 text-red-800' },
};

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      Confiança: {cfg.label}
    </span>
  );
}

function HumanReviewBanner({ reason }: { reason?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <span className="font-semibold">Validação humana recomendada. </span>
        {reason && <span>{reason}</span>}
        {!reason && <span>Esta resposta pode conter informações que requerem validação de profissional habilitado (SESMT, Engenheiro de Segurança ou Médico do Trabalho).</span>}
      </div>
    </div>
  );
}

function AnswerCard({ response }: { response: SstChatResponse }) {
  return (
    <div className="space-y-3">
      {response.needsHumanReview && (
        <HumanReviewBanner reason={response.humanReviewReason} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge level={response.confidence} />
        {response.sources.map((src) => (
          <span key={src} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            {src}
          </span>
        ))}
        {response.toolsUsed.length > 0 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            🔧 {response.toolsUsed.join(', ')}
          </span>
        )}
      </div>

      <div className="whitespace-pre-wrap text-sm text-gray-800">{response.answer}</div>

      {response.warnings.length > 0 && (
        <div className="space-y-1">
          {response.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {response.suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {response.suggestedActions.map((action, i) => (
            <a
              key={i}
              href={action.href ?? '#'}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {action.label}
              <ChevronRight className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

type ChatEntry =
  | { type: 'user'; text: string }
  | { type: 'assistant'; response: SstChatResponse }
  | { type: 'error'; message: string };

export default function SstAgentPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SstHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, loading]);

  const getConversationHistory = (): ConversationMessage[] => {
    const msgs: ConversationMessage[] = [];
    for (const entry of entries) {
      if (entry.type === 'user') msgs.push({ role: 'user', content: entry.text });
      if (entry.type === 'assistant') msgs.push({ role: 'assistant', content: entry.response.answer });
    }
    return msgs;
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setEntries((prev) => [...prev, { type: 'user', text: question }]);
    setLoading(true);

    try {
      const history = getConversationHistory();
      const response = await sstAgentService.chat(question, history);
      setEntries((prev) => [...prev, { type: 'assistant', response }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao comunicar com o agente SST.';
      setEntries((prev) => [...prev, { type: 'error', message: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await sstAgentService.getHistory(30);
      setHistory(data);
    } catch {
      // silencioso
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    loadHistory();
  };

  const loadFromHistory = (item: SstHistoryItem) => {
    setShowHistory(false);
    setEntries([
      { type: 'user', text: item.question },
      ...(item.response
        ? [{
            type: 'assistant' as const,
            response: {
              ...item.response,
              interactionId: item.id,
              status: item.status,
              timestamp: item.created_at,
            },
          }]
        : []),
    ]);
  };

  const SUGGESTED_QUESTIONS = [
    'Quais treinamentos estão vencendo nos próximos 30 dias?',
    'Quais exames médicos estão próximos do vencimento?',
    'Gere um resumo geral do status SST da empresa.',
    'Quais são as estatísticas de acidentes (CATs) registrados?',
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Agente SST</h1>
            <p className="text-xs text-gray-500">Consultor especialista em Saúde e Segurança do Trabalho</p>
          </div>
        </div>
        <button
          onClick={openHistory}
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <History className="h-4 w-4" />
          Histórico
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {entries.length === 0 && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
                  <Bot className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Como posso ajudar?</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Sou especialista em SST. Consulte dados reais do sistema, normas regulamentadoras e orientações de conformidade.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="rounded-xl border bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                ⚠️ Este agente orienta e informa, mas não substitui profissionais habilitados (SESMT, Engenheiro de Segurança, Médico do Trabalho).
              </p>
            </div>
          )}

          {entries.map((entry, i) => {
            if (entry.type === 'user') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-3 text-sm text-white">
                    {entry.text}
                  </div>
                </div>
              );
            }

            if (entry.type === 'error') {
              return (
                <div key={i} className="flex justify-start">
                  <div className="flex max-w-[80%] items-start gap-2 rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {entry.message}
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="flex justify-start">
                <div className="flex max-w-[85%] gap-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <Bot className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border bg-white px-4 py-3 shadow-sm">
                    <AnswerCard response={entry.response} />
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border bg-white px-4 py-3 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500">Consultando dados e normas...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-white px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border bg-gray-50 px-4 py-3 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Faça uma pergunta sobre SST... (Enter para enviar, Shift+Enter para nova linha)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
              style={{ maxHeight: '120px' }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            As respostas são orientativas. Decisões técnicas e laudos requerem profissional habilitado.
          </p>
        </div>
      </div>

      {/* History drawer */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowHistory(false)} />
          <div className="relative flex h-full w-96 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-4">
              <h2 className="font-semibold text-gray-900">Histórico de Consultas</h2>
              <button onClick={() => setShowHistory(false)} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHistory && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </div>
              )}
              {!loadingHistory && history.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-8">Nenhuma consulta anterior.</p>
              )}
              {!loadingHistory && history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadFromHistory(item)}
                  className="mb-2 w-full rounded-lg border bg-gray-50 px-3 py-3 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-800 line-clamp-2">{item.question}</p>
                    {item.status === 'needs_review' && (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    {item.status === 'success' && (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(item.created_at).toLocaleString('pt-BR')}
                    {item.confidence && ` · Confiança: ${CONFIDENCE_CONFIG[item.confidence]?.label ?? item.confidence}`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
