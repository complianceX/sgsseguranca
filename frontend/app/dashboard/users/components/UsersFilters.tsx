import { Search } from 'lucide-react';

interface UsersFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export function UsersFilters({ searchTerm, onSearchChange }: UsersFiltersProps) {
  return (
    <div className="ds-crud-filter-header">
      <div className="ds-crud-search">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
        </span>
        <input
          type="text"
          placeholder="Pesquisar usuários..."
          className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
