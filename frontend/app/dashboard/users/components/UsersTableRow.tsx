import React from 'react';
import { User } from '@/services/usersService';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface UsersTableRowProps {
  user: User;
  onDelete: (id: string) => void;
}

export const UsersTableRow = React.memo(({ user, onDelete }: UsersTableRowProps) => {
  return (
    <TableRow>
      <TableCell className="px-5 py-4">
        <div className="font-medium text-[var(--ds-color-text-primary)]">{user.nome}</div>
        <div className="text-xs text-[var(--ds-color-text-muted)]">{user.email}</div>
      </TableCell>
      <TableCell className="px-5 py-4 text-[var(--ds-color-text-secondary)]">{user.cpf}</TableCell>
      <TableCell className="px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {user.funcao || '-'}
      </TableCell>
      <TableCell className="px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {user.profile?.nome || user.role}
      </TableCell>
      <TableCell className="px-5 py-4 text-right">
        <div className="flex justify-end gap-1">
          <Link
            href={`/dashboard/users/edit/${user.id}`}
            className={cn(buttonVariants({ size: 'icon', variant: 'ghost' }))}
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(user.id)}
            className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
            title="Anonimizar e desativar (LGPD)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

UsersTableRow.displayName = 'UsersTableRow';
