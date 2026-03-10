import React from 'react';
import { User } from '@/services/usersService';
import { UsersTableRow } from './UsersTableRow';

interface UsersTableProps {
  users: User[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export const UsersTable = React.memo(({ users, loading, onDelete }: UsersTableProps) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-[var(--ds-color-text-secondary)]">
        <thead className="bg-[color:var(--ds-color-surface-muted)]/28 text-[11px] uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">
          <tr>
            <th className="px-5 py-3 font-semibold">Nome</th>
            <th className="px-5 py-3 font-semibold">CPF</th>
            <th className="px-5 py-3 font-semibold">Função</th>
            <th className="px-5 py-3 font-semibold">Perfil</th>
            <th className="px-5 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-color-border-subtle)]">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-5 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                </div>
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-5 py-10 text-center text-[var(--ds-color-text-muted)]">
                Nenhum usuário encontrado.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <UsersTableRow 
                key={user.id} 
                user={user} 
                onDelete={onDelete} 
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
});

UsersTable.displayName = 'UsersTable';
