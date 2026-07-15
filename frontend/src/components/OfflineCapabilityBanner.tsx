'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import {
  isOfflineActionAllowed,
  offlineCapabilityMessage,
  resolveOfflineRouteCapability,
} from '@/lib/offline-capabilities';

const BLOCKED_MESSAGE =
  'Ação indisponível offline. Reconecte-se antes de iniciar esta operação.';

function getInitialOnlineStatus() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Shared offline guard. Submits and semantically mutable buttons are stopped
 * in capture phase. Pure UI/read controls opt out with semantic ARIA state or
 * `data-offline-action="read"`; priority mutations can be explicit `write`.
 */
export function OfflineCapabilityBanner({
  pathname: pathnameOverride,
}: {
  pathname?: string;
}) {
  const currentPathname = usePathname();
  const pathname = pathnameOverride ?? currentPathname;
  const [online, setOnline] = useState(getInitialOnlineStatus);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const { capability } = resolveOfflineRouteCapability(pathname);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setBlockedMessage(null);
    };
    const handleOffline = () => setOnline(false);

    setOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOfflineActionAllowed(capability, 'write', online)) return;

    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setBlockedMessage(BLOCKED_MESSAGE);
    };
    const handleSubmit = (event: SubmitEvent) => block(event);
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const action = target.closest<HTMLElement>(
        '[data-online-only="true"], [data-offline-action="write"]',
      );
      const explicitRead = target.closest<HTMLElement>(
        '[data-offline-action="read"], [data-offline-ui="true"]',
      );
      if (explicitRead) return;
      const newLink = target.closest<HTMLAnchorElement>('a[href]');
      const startsLongOnlineFlow = newLink
        ? /(?:^|\/)new(?:[/?#]|$)/.test(newLink.getAttribute('href') ?? '')
        : false;
      const button = target.closest<HTMLButtonElement>('button');
      const buttonSemantics = button
        ? `${button.getAttribute('aria-label') ?? ''} ${button.title} ${button.textContent ?? ''}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
        : '';
      const semanticallyMutable = button
        ? button.type === 'submit' ||
          /\b(salvar|excluir|remover|apagar|criar|novo|nova|registrar|editar|atualizar|aprovar|reprovar|assinar|enviar|cancelar rdo)\b/.test(
            buttonSemantics,
          )
        : false;
      if (action || startsLongOnlineFlow || semanticallyMutable) block(event);
    };

    document.addEventListener('submit', handleSubmit, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('submit', handleSubmit, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [capability, online]);

  if (online) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-offline-capability={capability}
      className="mx-4 mt-3 rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-text-primary)] sm:mx-6"
    >
      <div className="flex items-start gap-2">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Modo offline</p>
          <p className="mt-0.5">{offlineCapabilityMessage(capability)}</p>
          {blockedMessage ? (
            <p role="alert" className="mt-2 font-semibold">
              {blockedMessage}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
