'use client';

// ---------------------------------------------------------------------------
// SentryUserContext — sincroniza contexto de usuário com Sentry.
//
// LGPD: envia apenas IDs e role. NUNCA envia nome, CPF ou e-mail.
// Deve ser renderizado dentro de AuthProvider.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { loadBrowserSentry } from '@/lib/sentry/browser-client';

export function SentryUserContext() {
  const { user } = useAuth();

  useEffect(() => {
    void loadBrowserSentry().then((Sentry) => {
      if (!Sentry) {
        return;
      }

      if (user) {
        Sentry.setUser({
          id: user.id, // UUID — não é PII
        });
        Sentry.setTag('tenant.id', user.company_id);
        Sentry.setTag('user.role', user.role);
      } else {
        Sentry.setUser(null);
        Sentry.setTag('tenant.id', '');
        Sentry.setTag('user.role', '');
      }
    });
  }, [user]);

  return null;
}
