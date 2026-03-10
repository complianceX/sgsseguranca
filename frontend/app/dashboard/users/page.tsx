'use client';

import { useUsers } from './hooks/useUsers';
import { UsersHeader } from './components/UsersHeader';
import { UsersFilters } from './components/UsersFilters';
import { UsersTable } from './components/UsersTable';
import { PaginationControls } from '@/components/PaginationControls';
import { Card } from '@/components/ui/card';

export default function UsersPage() {
  const {
    loading,
    filteredUsers,
    searchTerm,
    setSearchTerm,
    page,
    setPage,
    total,
    lastPage,
    deleteUser,
  } = useUsers();

  return (
    <div className="ds-crud-page">
      <UsersHeader />

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <UsersFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        <UsersTable
          users={filteredUsers}
          loading={loading}
          onDelete={deleteUser}
        />

        {!loading && (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        )}
      </Card>
    </div>
  );
}
