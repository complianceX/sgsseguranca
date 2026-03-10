'use client';

import React from 'react';
import { Risk } from '@/services/risksService';
import { RisksTableRow } from './RisksTableRow';

interface RisksTableProps {
  risks: Risk[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export const RisksTable = React.memo(({
  risks,
  loading,
  onDelete,
}: RisksTableProps) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-[var(--ds-color-text-secondary)]">
        <thead className="bg-[color:var(--ds-color-surface-muted)]/28 text-[11px] uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">
          <tr>
            <th className="px-5 py-3 font-semibold">Nome</th>
            <th className="px-5 py-3 font-semibold">Descrição</th>
            <th className="px-5 py-3 font-semibold">Data de Criação</th>
            <th className="px-5 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ds-color-border-subtle)]">
          {loading ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                </div>
              </td>
            </tr>
          ) : risks.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-[var(--ds-color-text-muted)]">
                Nenhum risco encontrado.
              </td>
            </tr>
          ) : (
            risks.map((risk) => (
              <RisksTableRow
                key={risk.id}
                risk={risk}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
});

RisksTable.displayName = 'RisksTable';
