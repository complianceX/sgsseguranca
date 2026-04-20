'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';

const ChecklistForm = dynamic(
  () =>
    import('../components/ChecklistForm').then(
      (module) => module.ChecklistForm,
    ),
  {
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando formulário de checklist...
      </div>
    ),
  },
);

export default function NewChecklistPage() {
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get('mode');
  const [mode, setMode] = useState<'checklist' | 'template'>(
    requestedMode === 'template' ? 'template' : 'checklist',
  );

  useEffect(() => {
    setMode(requestedMode === 'template' ? 'template' : 'checklist');
  }, [requestedMode]);

  return (
    <div className="space-y-4 py-2">
      {/* Toggle de modo */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] p-1 w-fit">
        <button
          type="button"
          onClick={() => setMode('checklist')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold motion-safe:transition-all',
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
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold motion-safe:transition-all',
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
