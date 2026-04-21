'use client';

import React from 'react';
import { Risk } from '@/services/risksService';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface RisksTableRowProps {
  risk: Risk;
  onDelete: (id: string) => void;
}

export const RisksTableRow = React.memo(({
  risk,
  onDelete,
}: RisksTableRowProps) => {
  return (
    <TableRow>
      <TableCell className="px-5 py-4 font-medium text-[var(--ds-color-text-primary)]">
        {risk.nome}
      </TableCell>
      <TableCell className="max-w-xs truncate px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {risk.descricao || '-'}
      </TableCell>
      <TableCell className="px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {risk.created_at ? safeToLocaleDateString(risk.created_at, 'pt-BR', undefined, '-') : '-'}
      </TableCell>
      <TableCell className="px-5 py-4 text-right">
        <div className="flex justify-end gap-1">
          <Link
            href={`/dashboard/risks/edit/${risk.id}`}
            className={cn(buttonVariants({ size: 'icon', variant: 'ghost' }))}
            title="Editar Risco"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(risk.id)}
            className="text-[var(--ds-color-danger)] motion-safe:transition-colors hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
            title="Excluir Risco"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

RisksTableRow.displayName = 'RisksTableRow';
