'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

interface AprFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
}

const APR_STATUSES = ['Pendente', 'Aprovada', 'Cancelada', 'Encerrada'];

export const AprFilters = React.memo(({ searchTerm, onSearchChange, statusFilter, onStatusChange }: AprFiltersProps) => {
  const hasFilters = searchTerm || statusFilter;

  return (
    <div className="border-b p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar APRs..."
            className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none transition-all"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <select
          title="Filtrar por status"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className="rounded-md border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos os status</option>
          {APR_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={() => { onSearchChange(''); onStatusChange(''); }}
            className="flex items-center gap-1 rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>
    </div>
  );
});

AprFilters.displayName = 'AprFilters';
