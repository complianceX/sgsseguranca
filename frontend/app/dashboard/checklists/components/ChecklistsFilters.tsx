import React from 'react';
import { Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

interface ChecklistsFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  modelFilter: 'all' | 'model' | 'regular';
  onModelFilterChange: (value: 'all' | 'model' | 'regular') => void;
  onExportCsv: () => void;
}

export const ChecklistsFilters = React.memo(({
  searchTerm,
  onSearchChange,
  modelFilter,
  onModelFilterChange,
  onExportCsv
}: ChecklistsFiltersProps) => {
  return (
    <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
          <input
            type="text"
            placeholder="Pesquisar checklists..."
            aria-label="Pesquisar checklists"
            className={cn(inputClassName, 'pl-10')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">
              Filtro
            </span>
            <select
              aria-label="Filtro de checklists"
              className={inputClassName}
              value={modelFilter}
              onChange={(e) => onModelFilterChange(e.target.value as 'all' | 'model' | 'regular')}
            >
              <option value="regular">Registros</option>
              <option value="model">Modelos</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <Button
            type="button"
            onClick={onExportCsv}
            variant="outline"
            leftIcon={<Download className="h-4 w-4" />}
          >
            Exportar CSV
          </Button>
        </div>
      </div>
    </div>
  );
});

ChecklistsFilters.displayName = 'ChecklistsFilters';
