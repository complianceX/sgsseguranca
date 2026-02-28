'use client';

import { useUsers } from './hooks/useUsers';
import { UsersHeader } from './components/UsersHeader';
import { UsersFilters } from './components/UsersFilters';
import { UsersTable } from './components/UsersTable';
import { PaginationControls } from '@/components/PaginationControls';

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
    <div className="space-y-6">
      <UsersHeader />

      <div className="rounded-xl border bg-white shadow-sm">
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
      </div>
    </div>
  );
}
