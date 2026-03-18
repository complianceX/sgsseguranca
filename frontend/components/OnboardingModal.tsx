'use client';

import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ClipboardList,
  Bell,
  BarChart2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import {
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from '@/components/ui/modal-frame';

const STORAGE_KEY = 'cx_onboarding_done_v1';

const STEPS = [
  {
    icon: ShieldCheck,
    iconColor: 'text-amber-400',
    iconBg: 'bg-[color:var(--ds-color-action-primary)]/15',
    title: 'Bem-vindo ao <GST> Gestão de Segurança do Trabalho',
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
    iconColor: 'text-[var(--ds-color-accent)]',
    iconBg: 'bg-[color:var(--ds-color-accent-subtle)]',
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
    <ModalFrame isOpen={open} onClose={dismiss} shellClassName="w-full max-w-md overflow-hidden p-0" overlayClassName="z-[200] px-4">
      <ModalHeader
        title="Primeiros passos"
        description={`Passo ${step + 1} de ${STEPS.length}`}
        icon={<Icon className={`h-5 w-5 ${current.iconColor}`} />}
        onClose={dismiss}
        className="border-b-0 pb-0"
      />

      <ModalBody className="px-8 pb-8 pt-4">
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl ${current.iconBg}`}>
            <Icon className={`h-8 w-8 ${current.iconColor}`} />
        </div>

        <h2 className="text-center text-xl font-bold text-[var(--ds-color-text-primary)]">{current.title}</h2>
        <p className="mt-3 text-center text-sm leading-relaxed text-[var(--ds-color-text-muted)]">{current.description}</p>

        {current.highlight && (
          <div className="mt-4 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/26 px-4 py-3">
            <StatusPill tone="success" className="mb-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Dica rápida
            </StatusPill>
            <p className="text-xs text-[var(--ds-color-text-secondary)]">{current.highlight}</p>
          </div>
        )}
      </ModalBody>

      <ModalFooter className="items-center justify-between bg-[color:var(--ds-color-surface-muted)]/18">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-5 bg-[var(--ds-color-action-primary)]' : 'w-2 bg-[var(--ds-color-border-default)] hover:bg-[var(--ds-color-border-strong)]'
                }`}
                aria-label={`Passo ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                variant="outline"
                size="sm"
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Anterior
              </Button>
            )}
            {isLast ? (
              <Button
                type="button"
                onClick={dismiss}
                size="sm"
                rightIcon={<CheckCircle2 className="h-4 w-4" />}
              >
                Começar
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Próximo
              </Button>
            )}
          </div>
      </ModalFooter>
    </ModalFrame>
  );
}
