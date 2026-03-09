'use client';

import React from 'react';
import { Pt } from '@/services/ptsService';
import { PtsTableRow } from './PtsTableRow';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/state';
import { TableRowSkeleton } from '@/components/ui/skeleton';

interface PtsTableProps {
  pts: Pt[];
  loading: boolean;
  onDelete: (id: string) => void;
  onPrint: (id: string) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export const PtsTable = React.memo(
  ({
    pts,
    loading,
    onDelete,
    onPrint,
    onSendEmail,
    onDownloadPdf,
    onApprove,
    onReject,
  }: PtsTableProps) => {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número / Título</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRowSkeleton key={index} cols={5} />
              ))
            ) : pts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10">
                  <EmptyState
                    title="Nenhuma PT encontrada"
                    description="Tente ajustar os filtros ou crie uma nova permissão de trabalho."
                    compact
                  />
                </TableCell>
              </TableRow>
            ) : (
              pts.map((pt) => (
                <PtsTableRow
                  key={pt.id}
                  pt={pt}
                  onDelete={onDelete}
                  onPrint={onPrint}
                  onSendEmail={onSendEmail}
                  onDownloadPdf={onDownloadPdf}
                  onApprove={onApprove}
                  onReject={onReject}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    );
  },
);

PtsTable.displayName = 'PtsTable';
