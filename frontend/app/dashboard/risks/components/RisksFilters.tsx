'use client';

import React from 'react';
import { Download, Search } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RisksFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const RisksFilters = React.memo(({
  searchTerm,
  onSearchChange,
}: RisksFiltersProps) => {
  return (
    <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
      <div className="ds-list-search md:max-w-sm">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
        </span>
        <input
          type="text"
          placeholder="Pesquisar riscos..."
          className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <button
        type="button"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex items-center')}
      >
        <Download className="h-4 w-4" />
        Exportar
      </button>
    </div>
  );
});

RisksFilters.displayName = 'RisksFilters';
