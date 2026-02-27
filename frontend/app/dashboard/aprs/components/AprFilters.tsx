'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface AprFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const AprFilters = React.memo(({ searchTerm, onSearchChange }: AprFiltersProps) => {
  return (
    <div className="border-b p-4">
      <div className="relative max-w-sm">
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
    </div>
  );
});

AprFilters.displayName = 'AprFilters';
