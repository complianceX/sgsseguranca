'use client';

import React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PtsFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

const PT_STATUSES = ['Pendente', 'Aprovada', 'Cancelada', 'Encerrada', 'Expirada'];
const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export const PtsFilters = React.memo(({ searchTerm, onSearchChange, statusFilter, onStatusChange }: PtsFiltersProps) => {
  const hasFilters = searchTerm || statusFilter;

  return (
    <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar PTs..."
            aria-label="Pesquisar PTs"
            className={cn(inputClassName, 'pl-10')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          title="Filtrar por status"
          aria-label="Filtrar PTs por status"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className={cn(inputClassName, 'min-w-[180px] pr-8')}
        >
          <option value="">Todos os status</option>
          {PT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {hasFilters && (
          <Button
            type="button"
            onClick={() => { onSearchChange(''); onStatusChange(''); }}
            variant="ghost"
            size="sm"
            leftIcon={<X className="h-3.5 w-3.5" />}
          >
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
});

PtsFilters.displayName = 'PtsFilters';
