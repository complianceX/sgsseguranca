'use client';

import { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ClipboardList,
  Bell,
  BarChart2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';

const STORAGE_KEY = 'cx_onboarding_done_v1';

const STEPS = [
  {
    icon: ShieldCheck,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    title: 'Bem-vindo ao COMPLIANCE X',
    description:
      'Sua plataforma completa de gestão de Segurança e Saúde do Trabalho. Gerencie treinamentos, exames, EPIs, laudos e muito mais em um único lugar.',
    highlight: null,
  },
  {
    icon: ClipboardList,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    title: 'Documentos e Registros',
    description:
      'Crie APRs, PTAs, DDS, Checklists, Ordens de Serviço e Relatórios Diários de Obra. Todos com suporte a assinatura digital e exportação em PDF.',
    highlight: 'Acesse pelo menu lateral em "Documentos Operacionais"',
  },
  {
    icon: Bell,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    title: 'Alertas Automáticos',
    description:
      'O sistema monitora vencimentos de EPIs, treinamentos e exames médicos e envia alertas por e-mail antes que expirem. Configure os destinatários em Configurações.',
    highlight: 'Notificações aparecem no sino no topo da tela',
  },
  {
    icon: BarChart2,
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/15',
    title: 'KPIs e Relatórios SST',
    description:
      'Acompanhe indicadores de desempenho em segurança: acidentabilidade, não conformidades, ações corretivas e treinamentos — tudo em gráficos interativos.',
    highlight: 'Veja em "Gestão & Controle → KPIs SST"',
  },
];

interface Props {
  userId?: string;
}

export function OnboardingModal({ userId }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const key = `${STORAGE_KEY}_${userId}`;
    if (!localStorage.getItem(key)) {
      setOpen(true);
    }
  }, [userId]);

  const dismiss = () => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, '1');
    setOpen(false);
  };

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md rounded-2xl bg-[#1E293B] border border-[#334155] shadow-2xl overflow-hidden">
        {/* Fechar */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 text-[#64748B] hover:text-[#F1F5F9] transition-colors"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Conteúdo */}
        <div className="p-8 pt-10">
          {/* Ícone */}
          <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${current.iconBg}`}>
            <Icon className={`h-8 w-8 ${current.iconColor}`} />
          </div>

          {/* Título e descrição */}
          <h2 className="text-center text-xl font-bold text-[#F1F5F9]">{current.title}</h2>
          <p className="mt-3 text-center text-sm text-[#94A3B8] leading-relaxed">{current.description}</p>

          {/* Dica */}
          {current.highlight && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#334155] bg-[#0F172A] px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-xs text-[#CBD5E1]">{current.highlight}</p>
            </div>
          )}
        </div>

        {/* Footer com indicadores e navegação */}
        <div className="border-t border-[#334155] bg-[#0F172A] px-6 py-4 flex items-center justify-between">
          {/* Dots */}
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-5 bg-blue-500' : 'w-2 bg-[#334155] hover:bg-[#475569]'
                }`}
                aria-label={`Passo ${i + 1}`}
              />
            ))}
          </div>

          {/* Botões */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 rounded-lg border border-[#334155] px-3 py-1.5 text-sm text-[#94A3B8] hover:border-[#475569] hover:text-[#F1F5F9] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Começar
                <CheckCircle2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
