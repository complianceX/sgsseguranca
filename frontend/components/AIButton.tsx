'use client';

import { useState } from 'react';
import { AIChatPanel } from './AIChatPanel';
import { Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { getAiRouteContext } from '@/lib/ai-context';

export function AIButton() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const context = getAiRouteContext(pathname);
  const ContextIcon = context.icon;

  return (
    <>
      <div className="fixed bottom-24 left-4 z-50 sm:bottom-6 sm:left-6">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 px-4 text-white shadow-xl transition-all hover:scale-[1.03] active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          title={isOpen ? 'Fechar especialista SST' : context.title}
        >
          {isOpen ? (
            <X className="h-7 w-7 transition-transform" />
          ) : (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/14">
                <ContextIcon className="h-5 w-5" />
              </span>
              <span className="hidden max-w-[11rem] truncate text-sm font-semibold sm:block">
                {context.title}
              </span>
            </>
          )}
          
          {/* Pulse effect */}
          {!isOpen && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></span>
          )}
          
          {/* Tooltip hint */}
          {!isOpen && (
            <span className="absolute bottom-full left-0 mb-3 hidden w-max rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-sky-300" />
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
