'use client';

// ---------------------------------------------------------------------------
// SentryUserContext — sincroniza contexto de usuário com Sentry.
//
// LGPD: envia apenas IDs e role. NUNCA envia nome, CPF ou e-mail.
// Deve ser renderizado dentro de AuthProvider.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import * as Sentry from '@sentry/browser';
import { useAuth } from '@/context/AuthContext';

export function SentryUserContext() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      Sentry.setUser({
        id: user.id,           // UUID — não é PII
        // LGPD: sem nome, e-mail, CPF
      });
      Sentry.setTag('tenant.id', user.company_id);
      Sentry.setTag('user.role', user.role);
    } else {
      Sentry.setUser(null);
      Sentry.setTag('tenant.id', '');
      Sentry.setTag('user.role', '');
    }
  }, [user]);

  return null;
}
