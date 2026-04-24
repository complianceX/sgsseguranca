'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileText, ShieldCheck, Brain } from 'lucide-react';
import {
  consentsService,
  ConsentStatusEntry,
  ConsentType,
} from '@/services/consentsService';
import { Button } from '@/components/ui/button';
import {
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from '@/components/ui/modal-frame';

interface FirstAccessConsentModalProps {
  pendingTypes: ConsentType[];
  consents: ConsentStatusEntry[];
  onAccepted: () => void;
}

const CONSENT_META: Record<
  string,
  { label: string; description: string; icon: React.ReactNode; required: boolean }
> = {
  privacy: {
    label: 'Política de Privacidade',
    description:
      'Como tratamos seus dados pessoais, finalidades, bases legais e seus direitos como titular (LGPD Art. 18).',
    icon: <ShieldCheck className="h-4 w-4" />,
    required: true,
  },
  terms: {
    label: 'Termos de Uso',
    description:
      'Regras de uso da plataforma, responsabilidades do Cliente, condições de IA e limitação de responsabilidade.',
    icon: <FileText className="h-4 w-4" />,
    required: true,
  },
  ai_processing: {
    label: 'Processamento por IA (opcional)',
    description:
      'Autorizo o processamento de dados agregados de SST pelo assistente de IA. Nenhum dado pessoal individual é enviado ao modelo.',
    icon: <Brain className="h-4 w-4" />,
    required: false,
  },
};

const LINK_MAP: Partial<Record<ConsentType, string>> = {
  privacy: '/privacidade',
  terms: '/termos',
};

export function FirstAccessConsentModal({
  pendingTypes,
  consents,
  onAccepted,
}: FirstAccessConsentModalProps) {
  const allTypes: ConsentType[] = [
    ...pendingTypes,
    ...(!pendingTypes.includes('ai_processing') &&
    !consents.find((c) => c.type === 'ai_processing' && c.active)
      ? (['ai_processing'] as ConsentType[])
      : []),
  ];

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allTypes.map((t) => [t, false])),
  );
  const [saving, setSaving] = useState(false);

  const requiredUnchecked = pendingTypes.some((t) => !checked[t]);

  const toggle = (type: string) =>
    setChecked((prev) => ({ ...prev, [type]: !prev[type] }));

  const handleAccept = async () => {
    if (requiredUnchecked || saving) return;

    setSaving(true);
    try {
      const typesToAccept = allTypes.filter((t) => checked[t]);
      await Promise.all(typesToAccept.map((t) => consentsService.accept(t)));
      onAccepted();
    } catch {
      toast.error('Não foi possível salvar os consentimentos. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      isOpen
      onClose={() => {}}
      shellClassName="max-w-[42rem]"
      overlayClassName="animate-none"
    >
      <div>
        <ModalHeader
          title="Bem-vindo ao SGS — Aceite necessário"
          description="Para continuar, leia e aceite os documentos legais abaixo. São obrigatórios para uso da plataforma."
          icon={<ShieldCheck className="h-5 w-5" />}
        />

        <ModalBody className="space-y-3">
          {allTypes.map((type) => {
            const meta = CONSENT_META[type];
            if (!meta) return null;
            const href = LINK_MAP[type];
            const current = consents.find((c) => c.type === type);
            const versionLabel = current?.currentVersionLabel;

            return (
              <label
                key={type}
                className="flex cursor-pointer items-start gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-4 py-3 text-sm transition-colors hover:bg-[var(--ds-color-surface-raised)]"
              >
                <input
                  type="checkbox"
                  checked={checked[type] ?? false}
                  onChange={() => toggle(type)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-[var(--ds-color-text-primary)]">
                    <span className="text-[var(--ds-color-action-primary)]">
                      {meta.icon}
                    </span>
                    {meta.label}
                    {meta.required ? (
                      <span className="ml-1 rounded-full bg-[var(--ds-color-danger-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-color-danger-fg)]">
                        obrigatório
                      </span>
                    ) : null}
                    {versionLabel ? (
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--ds-color-text-tertiary)]">
                        v{versionLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--ds-color-text-secondary)]">
                    {meta.description}
                  </p>
                  {href ? (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-[12px] text-[var(--ds-color-action-primary)] underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ler documento completo
                    </Link>
                  ) : null}
                </div>
              </label>
            );
          })}

          <p className="pt-1 text-[11px] text-[var(--ds-color-text-tertiary)]">
            Seus dados são protegidos conforme a LGPD. Você pode revogar consentimentos
            opcionais em Configurações → Privacidade a qualquer momento.
          </p>
        </ModalBody>

        <ModalFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--ds-color-text-tertiary)]">
              {pendingTypes.length} documento{pendingTypes.length !== 1 ? 's' : ''}{' '}
              obrigatório{pendingTypes.length !== 1 ? 's' : ''}
            </span>
            <Button
              type="button"
              variant="primary"
              onClick={handleAccept}
              disabled={requiredUnchecked || saving}
              loading={saving}
            >
              {saving ? 'Salvando...' : 'Aceitar e continuar'}
            </Button>
          </div>
        </ModalFooter>
      </div>
    </ModalFrame>
  );
}
