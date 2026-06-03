'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, Brain, Globe, RotateCcw } from 'lucide-react';
import { consentsService } from '@/services/consentsService';
import { Button } from '@/components/ui/button';
import { ModalBody, ModalFooter, ModalFrame, ModalHeader } from '@/components/ui/modal-frame';

interface AiConsentModalProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export function AiConsentModal({ onAccept, onDismiss }: AiConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    if (!checked || saving) return;

    setSaving(true);
    try {
      await consentsService.accept('ai_processing');
      onAccept();
    } catch {
      toast.error('Não foi possível salvar o consentimento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalFrame
      isOpen
      onClose={onDismiss}
      overlayClassName="animate-none"
      shellClassName="animate-none max-w-[38rem]"
    >
      <div>
        <ModalHeader
          title="Consentimento para uso da IA (LGPD)"
          description="Para usar a SOPHIE, precisamos do seu consentimento explícito para processar dados do sistema conforme a LGPD."
          icon={<Brain className="h-5 w-5" />}
          onClose={onDismiss}
        />

        <ModalBody className="space-y-4">
          <div className="space-y-3">
            <InfoItem icon={<ShieldCheck className="h-4 w-4" />} title="O que é enviado para a IA">
              Dados <strong>minimizados e pseudonimizados</strong> do contexto operacional
              podem ser usados para gerar respostas. Não informe CPF, dados de saúde
              individual, documentos pessoais ou informações excessivas nos prompts.
            </InfoItem>

            <InfoItem icon={<Globe className="h-4 w-4" />} title="Para onde são enviados">
              Quando o recurso estiver habilitado contratualmente, os dados necessários
              são processados pela <strong>OpenAI, LLC</strong>, com possibilidade de
              transferência internacional conforme a Política de Privacidade vigente.
            </InfoItem>

            <InfoItem icon={<RotateCcw className="h-4 w-4" />} title="Você pode revogar a qualquer momento">
              Acesse <strong>Configurações → Privacidade</strong> para desativar o
              processamento por IA quando quiser.
            </InfoItem>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-3 text-sm text-[var(--ds-color-text-primary)]">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Li e compreendi as informações acima. Consinto com o processamento dos dados
              necessários para uso da SOPHIE conforme o aviso e a Política de Privacidade vigente.
            </span>
          </label>
        </ModalBody>

        <ModalFooter>
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onDismiss}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleAccept}
              disabled={!checked || saving}
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

function InfoItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-3 py-3 text-sm text-[var(--ds-color-text-primary)]">
      <span className="mt-0.5 shrink-0 text-[var(--ds-color-action-primary)]">{icon}</span>
      <div>
        <strong className="mb-0.5 block text-[13px] text-[var(--ds-color-text-primary)]">{title}</strong>
        <span className="text-[13px] leading-relaxed text-[var(--ds-color-text-secondary)]">
          {children}
        </span>
      </div>
    </div>
  );
}
