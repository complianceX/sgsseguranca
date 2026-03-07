'use client';

import { useState } from 'react';
import { AIChatPanel } from './AIChatPanel';
import { X } from 'lucide-react';

export function AIButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 left-6 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xl transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          title={isOpen ? "Fechar especialista SST" : "Especialista SST"}
        >
          {isOpen ? (
            <X className="h-7 w-7 transition-transform" />
          ) : (
            <span className="text-2xl font-black italic tracking-tighter transition-transform group-hover:scale-110">
              G
            </span>
          )}
          
          {/* Pulse effect */}
          {!isOpen && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></span>
          )}
          
          {/* Tooltip hint */}
          {!isOpen && (
            <span className="absolute bottom-full left-0 mb-3 hidden w-max rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
              Especialista SST: como posso ajudar?
            </span>
          )}
        </button>
      </div>

      <AIChatPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
