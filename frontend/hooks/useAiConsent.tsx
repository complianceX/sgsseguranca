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

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AiConsentModal } from '@/components/AiConsentModal';
import { consentsService } from '@/services/consentsService';

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
  const [sessionConsent, setSessionConsent] = useState<boolean | null>(null);
  const [versionedConsent, setVersionedConsent] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setVersionedConsent(false);
      return;
    }

    let active = true;
    consentsService
      .getStatus()
      .then(({ consents }) => {
        if (!active) return;
        const aiConsent = consents.find((consent) => consent.type === 'ai_processing');
        setVersionedConsent(Boolean(aiConsent?.active && !aiConsent.needsReacceptance));
      })
      .catch(() => {
        if (active) setVersionedConsent(false);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  const consentGiven = sessionConsent !== null ? sessionConsent : versionedConsent;

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
