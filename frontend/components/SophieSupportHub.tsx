'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Bot,
  ClipboardCheck,
  FileText,
  ListChecks,
  Lock,
  MessageSquareText,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isAiEnabled } from '@/lib/featureFlags';

const supportActions = [
  {
    title: 'Abrir SOPHIE',
    description: 'Chat, trilha de auditoria e visão consolidada do suporte.',
    href: '/dashboard/sst-agent',
    icon: Bot,
  },
  {
    title: 'APR Assistida',
    description: 'Sugere riscos, controles e EPIs para acelerar a emissão.',
    href: '/dashboard/aprs/new',
    icon: FileText,
  },
  {
    title: 'PT Assistida',
    description: 'Analisa criticidade e reforça revisão humana na liberação.',
    href: '/dashboard/pts/new',
    icon: ClipboardCheck,
  },
  {
    title: 'Checklist Assistido',
    description: 'Gera checklist inicial e prepara automações com NC.',
    href: '/dashboard/checklists/new',
    icon: ListChecks,
  },
  {
    title: 'DDS Assistido',
    description: 'Cria pauta prática de diálogo de segurança para o campo.',
    href: '/dashboard/dds/new',
    icon: MessageSquareText,
  },
  {
    title: 'NC Assistida',
    description: 'Abre a criação assistida de não conformidade com rastreabilidade.',
    href: '/dashboard/sst-agent?documentType=nc',
    icon: AlertTriangle,
  },
];

export function SophieSupportHub() {
  const aiEnabled = isAiEnabled();
  const { loading, hasPermission } = useAuth();
  const canUseAi = hasPermission('can_use_ai');

  return (
    <section className="ds-dashboard-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
            suporte sst
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ds-color-text-primary)]">
            SOPHIE
          </h2>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            A SOPHIE centraliza apoio operacional, criação assistida de documentos e decisões com rastreabilidade.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-primary-subtle)] px-3 py-1 text-[11px] font-semibold text-[var(--ds-color-action-primary)]">
          <Sparkles className="h-3.5 w-3.5" />
          ativa
        </span>
      </div>

      {!aiEnabled ? (
        <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4">
          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
            A interface da SOPHIE foi desligada no frontend.
          </p>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            Reative com <code>NEXT_PUBLIC_FEATURE_AI_ENABLED=true</code> para exibir suporte, chat e atalhos assistidos.
          </p>
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-4 text-sm text-[var(--ds-color-text-secondary)]">
          Validando permissões e sincronizando a experiência da SOPHIE...
        </div>
      ) : !canUseAi ? (
        <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-4">
          <div className="flex items-center gap-2 text-[var(--ds-color-warning)]">
            <Lock className="h-4.5 w-4.5" />
            <p className="text-sm font-semibold">Seu perfil ainda não possui a permissão `can_use_ai`.</p>
          </div>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            A SOPHIE fica visível, mas os fluxos de análise e criação assistida exigem liberação de acesso no backend.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {supportActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-4 transition-all hover:-translate-y-px hover:border-[var(--ds-color-action-primary)]/35 hover:shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{action.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ds-color-text-secondary)]">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                <Wand2 className="h-3.5 w-3.5" />
                Automacao atual
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                APR, PT, checklist, DDS, NC assistida, chat contextual e gatilhos automáticos de NC.
              </p>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                Hoje a SOPHIE atua em modo assistido: ela prepara, recomenda e dispara fluxos suportados, com validação humana quando necessário.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                <Bot className="h-3.5 w-3.5" />
                Proxima interacao
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Use a SOPHIE para pedir apoio técnico e abrir os fluxos certos.
              </p>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                A tela inicial agora expõe a SOPHIE como suporte operacional, em vez de deixá-la escondida em cards secundários.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
