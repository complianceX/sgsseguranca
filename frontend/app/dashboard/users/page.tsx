'use client';

import { useUsers } from './hooks/useUsers';
import { UsersHeader } from './components/UsersHeader';
import { UsersFilters } from './components/UsersFilters';
import { UsersTable } from './components/UsersTable';

export default function UsersPage() {
  const {
    loading,
    filteredUsers,
    searchTerm,
    setSearchTerm,
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
      </div>
    </div>
  );
}
