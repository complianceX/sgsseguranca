'use client';

import React from 'react';
import { Risk } from '@/services/risksService';
import { EmptyState } from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  if (!loading && risks.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="Nenhum risco encontrado"
          description="Nao ha riscos visiveis no recorte atual. Ajuste a busca ou cadastre um novo risco para iniciar o monitoramento."
          compact
        />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Nome</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Data de criação</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={4} className="px-5 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-8 w-8 motion-safe:animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            risks.map((risk) => (
              <RisksTableRow
                key={risk.id}
                risk={risk}
                onDelete={onDelete}
              />
            ))
          )}
      </TableBody>
    </Table>
  );
});

RisksTable.displayName = 'RisksTable';
