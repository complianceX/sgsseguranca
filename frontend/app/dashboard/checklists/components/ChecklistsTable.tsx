import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { ChecklistsTableRow } from './ChecklistsTableRow';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ChecklistsTableProps {
  checklists: Checklist[];
  analyzingId: string | null;
  printingId: string | null;
  onAiAnalysis: (id: string) => void;
  onPrint: (checklist: Checklist) => void;
  onDownloadPdf: (checklist: Checklist) => void;
  onSendEmail: (checklist: Checklist) => void;
  onDelete: (id: string) => void;
}

export const ChecklistsTable = React.memo(({
  checklists,
  analyzingId,
  printingId,
  onAiAnalysis,
  onPrint,
  onDownloadPdf,
  onSendEmail,
  onDelete
}: ChecklistsTableProps) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Título</TableHead>
          <TableHead>Ferramenta/Máquina</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {checklists.map((checklist) => (
          <ChecklistsTableRow
            key={checklist.id}
            checklist={checklist}
            analyzingId={analyzingId}
            printingId={printingId}
            onAiAnalysis={onAiAnalysis}
            onPrint={onPrint}
            onDownloadPdf={onDownloadPdf}
            onSendEmail={onSendEmail}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
});

ChecklistsTable.displayName = 'ChecklistsTable';
