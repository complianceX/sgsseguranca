import React from 'react';
import { Search, Download } from 'lucide-react';

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
    <div className="border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar checklists..."
            className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Filtro</span>
            <select
              aria-label="Filtro de checklists"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
              value={modelFilter}
              onChange={(e) => onModelFilterChange(e.target.value as 'all' | 'model' | 'regular')}
            >
              <option value="regular">Registros</option>
              <option value="model">Modelos</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onExportCsv}
            className="flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>
    </div>
  );
});

ChecklistsFilters.displayName = 'ChecklistsFilters';
