'use client';

import { useState } from 'react';
import { AIChatPanel } from './AIChatPanel';
import { Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getAiRouteContext } from '@/lib/ai-context';
import { isAiEnabled } from '@/lib/featureFlags';

export function AIButton() {
  if (!isAiEnabled()) return null;

  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const context = getAiRouteContext(pathname);
  const ContextIcon = context.icon;

  return (
    <>
      <div className="fixed bottom-24 left-4 z-50 sm:bottom-6 sm:left-6">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex h-12 items-center justify-center gap-2 rounded-full bg-[image:var(--ds-gradient-brand)] px-3.5 text-white shadow-[var(--ds-shadow-lg)] transition-all hover:-translate-y-px hover:brightness-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-color-focus)] focus:ring-offset-2 focus:ring-offset-[var(--ds-color-bg-canvas)]"
          title={isOpen ? 'Fechar SOPHIE' : context.title}
        >
          {isOpen ? (
            <X className="h-6 w-6 transition-transform" />
          ) : (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/14">
                <ContextIcon className="h-4.5 w-4.5" />
              </span>
              <span className="hidden max-w-[10rem] truncate text-[13px] font-semibold sm:block">
                {context.title}
              </span>
            </>
          )}
          
          {/* Pulse effect */}
          {!isOpen && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ds-color-primary-subtle)] opacity-50"></span>
          )}
          
          {/* Tooltip hint */}
          {!isOpen && (
            <span className="absolute bottom-full left-0 mb-3 hidden w-max rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-overlay)] px-3 py-1.5 text-[11px] font-medium text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-md)] group-hover:block">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[var(--ds-color-accent)]" />
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
