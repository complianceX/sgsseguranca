'use client';

import { useState } from 'react';
import { ChecklistForm } from '../components/ChecklistForm';
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function NewChecklistPage() {
  const [mode, setMode] = useState<'checklist' | 'template'>('checklist');

  return (
    <div className="space-y-4 py-2">
      {/* Toggle de modo */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode('checklist')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
            mode === 'checklist'
              ? 'bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-sm'
              : 'text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-secondary)]',
          )}
        >
          <ClipboardCheck className="h-4 w-4" />
          Checklist direto
        </button>
        <button
          type="button"
          onClick={() => setMode('template')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all',
            mode === 'template'
              ? 'bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-sm'
              : 'text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-secondary)]',
          )}
        >
          <ClipboardList className="h-4 w-4" />
          Criar modelo
        </button>
      </div>

      {mode === 'template' && (
        <p className="text-xs text-[var(--ds-color-text-muted)]">
          O modelo será salvo com <strong>is_modelo = true</strong> e ficará disponível para preenchimento em campo via <em>Preencher Checklist</em>.
        </p>
      )}

      <ChecklistForm mode={mode} />
    </div>
  );
}
