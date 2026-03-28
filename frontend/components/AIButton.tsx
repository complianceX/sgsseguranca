'use client';

import { useEffect, useState } from 'react';
import { AIChatPanel } from './AIChatPanel';
import { LifeBuoy, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getAiRouteContext } from '@/lib/ai-context';
import { isAiEnabled } from '@/lib/featureFlags';

export function AIButton() {
  const aiEnabled = isAiEnabled();
  const chatPanelId = 'sophie-chat-panel';

  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const context = getAiRouteContext(pathname);
  const ContextIcon = context.icon;

  useEffect(() => {
    if (!aiEnabled) {
      return;
    }

    const handleOpen = () => setIsOpen(true);
    const handleToggle = () => setIsOpen((current) => !current);
    const handleClose = () => setIsOpen(false);

    window.addEventListener('app:sophie-open', handleOpen as EventListener);
    window.addEventListener('app:sophie-toggle', handleToggle as EventListener);
    window.addEventListener('app:sophie-close', handleClose as EventListener);

    return () => {
      window.removeEventListener('app:sophie-open', handleOpen as EventListener);
      window.removeEventListener('app:sophie-toggle', handleToggle as EventListener);
      window.removeEventListener('app:sophie-close', handleClose as EventListener);
    };
  }, [aiEnabled]);

  if (!aiEnabled) return null;

  return (
    <>
      <div className="fixed bottom-24 right-4 z-50 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={chatPanelId}
          className="group relative flex h-14 items-center justify-center gap-2 rounded-full border border-[var(--ds-color-primary-border)] bg-[var(--component-fab-bg)] px-3.5 text-white shadow-[var(--ds-shadow-sm)] transition-[background-color,border-color,box-shadow] hover:border-[var(--ds-color-action-primary-active)] hover:bg-[var(--component-fab-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-color-bg-canvas)]"
          title={isOpen ? 'Fechar chat da SOPHIE' : `Abrir ${context.title}`}
        >
          {isOpen ? (
            <X className="h-6 w-6 transition-transform" />
          ) : (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/14">
                <ContextIcon className="h-4.5 w-4.5" />
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-white/88">
                  Chat SST
                </span>
                <span className="block max-w-[11rem] truncate text-[13px] font-semibold leading-tight">
                  {context.title}
                </span>
              </span>
            </>
          )}

          {!isOpen && (
            <span className="absolute bottom-full right-0 mb-3 hidden w-[18rem] rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)] px-3.5 py-3 text-[11px] font-medium text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] group-hover:block group-focus-within:block">
              <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-muted)]">
                <LifeBuoy className="h-3.5 w-3.5 text-[var(--ds-color-action-primary)]" />
                Chat da SOPHIE
              </span>
              <span className="flex items-start gap-1.5 leading-relaxed">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 text-[var(--ds-color-accent)]" />
                {context.subtitle}
              </span>
            </span>
          )}
        </button>
      </div>

      <AIChatPanel isOpen={isOpen} onClose={() => setIsOpen(false)} context={context} />
    </>
  );
}
