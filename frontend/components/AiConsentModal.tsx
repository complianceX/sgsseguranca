'use client';

// ---------------------------------------------------------------------------
// AiConsentModal — Exibe aviso de privacidade (LGPD) antes do primeiro uso
// do agente Sophie. Requer aceite explícito para prosseguir.
//
// Uso:
//   const { consentGiven, requestConsent } = useAiConsent();
//   // Antes de uma operação de IA:
//   if (!consentGiven) { requestConsent(); return; }
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck, X, Brain, Globe, RotateCcw } from 'lucide-react';
import { usersService } from '@/services/usersService';

interface AiConsentModalProps {
  onAccept: () => void;
  onDismiss: () => void;
}

export function AiConsentModal({ onAccept, onDismiss }: AiConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    if (!checked) return;
    setSaving(true);
    try {
      await usersService.updateAiConsent(true);
      onAccept();
    } catch {
      toast.error('Não foi possível salvar o consentimento. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    // Overlay
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Card */}
      <div
        style={{
          background: 'var(--ds-color-surface, #fff)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          position: 'relative',
        }}
      >
        {/* Fechar sem aceitar */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--ds-color-text-secondary, #6b7280)',
            padding: '4px',
          }}
        >
          <X size={18} />
        </button>

        {/* Ícone */}
        <div
          style={{
            marginBottom: '20px',
            color: 'var(--ds-color-action-primary, #4A443F)',
          }}
        >
          <Brain size={36} />
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          Consentimento para uso da IA (LGPD)
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--ds-color-text-secondary, #6b7280)', marginBottom: '20px', lineHeight: 1.6 }}>
          Para usar o agente SOPHIE, precisamos do seu consentimento explícito para
          processar dados do sistema conforme a Lei Geral de Proteção de Dados (LGPD).
        </p>

        {/* Detalhes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          <InfoItem icon={<ShieldCheck size={16} />} title="O que é enviado para a IA">
            Dados <strong>agregados e estatísticos</strong> sobre treinamentos pendentes,
            exames médicos a vencer e indicadores de SST. Nenhum nome, CPF ou dado
            individual de trabalhadores é transmitido.
          </InfoItem>

          <InfoItem icon={<Globe size={16} />} title="Para onde são enviados">
            Os dados são processados pela <strong>OpenAI, LLC</strong>, com servidores
            nos EUA, sob os termos de privacidade e o DPA (Data Processing Agreement)
            da OpenAI.
          </InfoItem>

          <InfoItem icon={<RotateCcw size={16} />} title="Você pode revogar a qualquer momento">
            Acesse <strong>Configurações → Privacidade</strong> para desativar o
            processamento por IA quando quiser.
          </InfoItem>
        </div>

        {/* Checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            marginBottom: '20px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{
              marginTop: '2px',
              accentColor: 'var(--ds-color-action-primary, #4A443F)',
              width: '16px',
              height: '16px',
              flexShrink: 0,
            }}
          />
          <span>
            Li e compreendi as informações acima. Consinto com o processamento
            dos dados pelo agente de IA conforme descrito.
          </span>
        </label>

        {/* Ações */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid var(--ds-color-border, #e5e7eb)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={!checked || saving}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              background:
                checked && !saving
                  ? 'var(--ds-color-action-primary, #4A443F)'
                  : 'var(--ds-color-action-secondary, #A79F97)',
              color: '#fff',
              cursor: checked && !saving ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {saving ? 'Salvando...' : 'Aceitar e continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function InfoItem({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      padding: '12px',
      borderRadius: '8px',
      background: 'var(--ds-color-surface-raised, #f9fafb)',
      border: '1px solid var(--ds-color-border, #e5e7eb)',
      fontSize: '13px',
    }}>
      <span
        style={{
          color: 'var(--ds-color-action-primary, #4A443F)',
          marginTop: '2px',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <strong style={{ display: 'block', marginBottom: '2px' }}>{title}</strong>
        <span style={{ color: 'var(--ds-color-text-secondary, #6b7280)', lineHeight: 1.5 }}>
          {children}
        </span>
      </div>
    </div>
  );
}
