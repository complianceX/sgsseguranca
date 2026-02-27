'use client';

import React from 'react';
import { Search, Download } from 'lucide-react';

interface RisksFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const RisksFilters = React.memo(({
  searchTerm,
  onSearchChange,
}: RisksFiltersProps) => {
  return (
    <div className="border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar riscos..."
            className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </div>
    </div>
  );
});

RisksFilters.displayName = 'RisksFilters';
