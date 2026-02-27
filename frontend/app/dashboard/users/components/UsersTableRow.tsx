import React from 'react';
import { User } from '@/services/usersService';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface UsersTableRowProps {
  user: User;
  onDelete: (id: string) => void;
}

export const UsersTableRow = React.memo(({ user, onDelete }: UsersTableRowProps) => {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4">
        <div className="font-medium text-gray-900">{user.nome}</div>
        <div className="text-xs text-gray-500">{user.email}</div>
      </td>
      <td className="px-6 py-4 text-gray-600">{user.cpf}</td>
      <td className="px-6 py-4 text-gray-600">{user.funcao || '-'}</td>
      <td className="px-6 py-4 text-gray-600">{user.profile?.nome || user.role}</td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end space-x-2">
          <Link
            href={`/dashboard/users/edit/${user.id}`}
            className="rounded p-1 text-blue-600 hover:bg-blue-50"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            onClick={() => onDelete(user.id)}
            className="rounded p-1 text-red-600 hover:bg-red-50"
        title="Anonimizar e desativar (LGPD)"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

UsersTableRow.displayName = 'UsersTableRow';
