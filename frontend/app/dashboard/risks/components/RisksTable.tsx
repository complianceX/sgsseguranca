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
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-700">
          <tr>
            <th className="px-6 py-3 font-semibold">Nome</th>
            <th className="px-6 py-3 font-semibold">Descrição</th>
            <th className="px-6 py-3 font-semibold">Data de Criação</th>
            <th className="px-6 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {loading ? (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                </div>
              </td>
            </tr>
          ) : risks.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
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
