'use client';

// ---------------------------------------------------------------------------
// useAiConsent — Gerencia o estado de consentimento para uso da IA (LGPD).
//
// Uso em qualquer componente que invoque o Sophie:
//
//   const { consentGiven, requestConsent, ConsentGate } = useAiConsent();
//
//   const handleAsk = async () => {
//     if (!consentGiven) { requestConsent(); return; }
//     await sophieService.chat(question);
//   };
//
//   return (
//     <>
//       <ConsentGate />
//       <button onClick={handleAsk}>Perguntar</button>
//     </>
//   );
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AiConsentModal } from '@/components/AiConsentModal';

interface UseAiConsentReturn {
  /** True se o usuário já deu consentimento (no perfil ou nesta sessão). */
  consentGiven: boolean;
  /** Abre o modal de consentimento. Chamar antes de qualquer operação de IA. */
  requestConsent: () => void;
  /** Renderiza o modal quando necessário — inclua no JSX do componente. */
  ConsentGate: () => React.ReactElement | null;
}

export function useAiConsent(): UseAiConsentReturn {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  // Atualização otimista: evita reload completo após aceite
  const [sessionConsent, setSessionConsent] = useState<boolean | null>(null);

  const consentGiven =
    sessionConsent !== null ? sessionConsent : (user?.ai_processing_consent ?? false);

  const requestConsent = useCallback(() => {
    if (consentGiven) return;
    setModalOpen(true);
  }, [consentGiven]);

  const ConsentGate = useCallback((): React.ReactElement | null => {
    if (!modalOpen) return null;
    return (
      <AiConsentModal
        onAccept={() => {
          setSessionConsent(true);
          setModalOpen(false);
        }}
        onDismiss={() => setModalOpen(false)}
      />
    );
  }, [modalOpen]);

  return { consentGiven, requestConsent, ConsentGate };
}
