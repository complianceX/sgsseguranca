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
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-700">
          <tr>
            <th className="px-6 py-3 font-semibold">Nome</th>
            <th className="px-6 py-3 font-semibold">CPF</th>
            <th className="px-6 py-3 font-semibold">Função</th>
            <th className="px-6 py-3 font-semibold">Perfil</th>
            <th className="px-6 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                </div>
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
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
