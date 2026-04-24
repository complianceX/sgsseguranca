'use client';

import { useEffect, useRef, useState } from 'react';
import { consentsService, ConsentStatusEntry, ConsentType } from '@/services/consentsService';

const REQUIRED_TYPES: ConsentType[] = ['privacy', 'terms'];

interface RequiredConsentsState {
  loading: boolean;
  needsConsent: boolean;
  pendingTypes: ConsentType[];
  consents: ConsentStatusEntry[];
}

export function useRequiredConsents(authenticated: boolean): RequiredConsentsState {
  const [state, setState] = useState<RequiredConsentsState>({
    loading: true,
    needsConsent: false,
    pendingTypes: [],
    consents: [],
  });

  const fetched = useRef(false);

  useEffect(() => {
    if (!authenticated || fetched.current) return;
    fetched.current = true;

    consentsService
      .getStatus()
      .then(({ consents }) => {
        const pending = REQUIRED_TYPES.filter((type) => {
          const entry = consents.find((c) => c.type === type);
          return !entry || !entry.active || entry.needsReacceptance;
        });

        setState({
          loading: false,
          needsConsent: pending.length > 0,
          pendingTypes: pending,
          consents,
        });
      })
      .catch(() => {
        setState({
          loading: false,
          needsConsent: true,
          pendingTypes: REQUIRED_TYPES,
          consents: [],
        });
      });
  }, [authenticated]);

  return state;
}
