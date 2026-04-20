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
    <tr className="motion-safe:transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/28">
      <td className="px-5 py-4">
        <div className="font-medium text-[var(--ds-color-text-primary)]">{user.nome}</div>
        <div className="text-xs text-[var(--ds-color-text-muted)]">{user.email}</div>
      </td>
      <td className="px-5 py-4 text-[var(--ds-color-text-secondary)]">{user.cpf}</td>
      <td className="px-5 py-4 text-[var(--ds-color-text-secondary)]">{user.funcao || '-'}</td>
      <td className="px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {user.profile?.nome || user.role}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="flex justify-end space-x-2">
          <Link
            href={`/dashboard/users/edit/${user.id}`}
            className="rounded p-1 text-[var(--ds-color-action-primary)] hover:bg-[color:var(--ds-color-action-primary)]/10"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(user.id)}
            className="rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
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
