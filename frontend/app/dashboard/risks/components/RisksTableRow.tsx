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
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 font-medium text-gray-900">{risk.nome}</td>
      <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{risk.descricao || '-'}</td>
      <td className="px-6 py-4 text-gray-500">
        {risk.created_at ? new Date(risk.created_at).toLocaleDateString('pt-BR') : '-'}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end space-x-2">
          <Link
            href={`/dashboard/risks/edit/${risk.id}`}
            className="rounded p-1.5 text-blue-600 hover:bg-blue-50 transition-colors"
            title="Editar Risco"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(risk.id)}
            className="rounded p-1.5 text-red-600 hover:bg-red-50 transition-colors"
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
