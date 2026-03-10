'use client';

import React from 'react';
import { Risk } from '@/services/risksService';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface RisksTableRowProps {
  risk: Risk;
  onDelete: (id: string) => void;
}

export const RisksTableRow = React.memo(({
  risk,
  onDelete,
}: RisksTableRowProps) => {
  return (
    <tr className="transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/28">
      <td className="px-5 py-4 font-medium text-[var(--ds-color-text-primary)]">{risk.nome}</td>
      <td className="max-w-xs truncate px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {risk.descricao || '-'}
      </td>
      <td className="px-5 py-4 text-[var(--ds-color-text-secondary)]">
        {risk.created_at ? new Date(risk.created_at).toLocaleDateString('pt-BR') : '-'}
      </td>
      <td className="px-5 py-4 text-right">
        <div className="flex justify-end space-x-2">
          <Link
            href={`/dashboard/risks/edit/${risk.id}`}
            className="rounded p-1.5 text-[var(--ds-color-action-primary)] transition-colors hover:bg-[color:var(--ds-color-action-primary)]/10"
            title="Editar Risco"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(risk.id)}
            className="rounded p-1.5 text-[var(--ds-color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger)]/10"
            title="Excluir Risco"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

RisksTableRow.displayName = 'RisksTableRow';
