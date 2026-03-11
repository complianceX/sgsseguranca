import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { ChecklistsTableRow } from './ChecklistsTableRow';
import { checklistColumnLabels, ChecklistColumnKey } from '../columns';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ChecklistsTableProps {
  checklists: Checklist[];
  visibleColumns: ChecklistColumnKey[];
  selectedIds: string[];
  allSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
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
  visibleColumns,
  selectedIds,
  allSelected,
  onToggleSelect,
  onToggleSelectAll,
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
          <TableHead className="w-10">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => onToggleSelectAll(event.target.checked)}
              className="h-4 w-4 rounded border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-action-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
              aria-label="Selecionar todos os checklists da página"
            />
          </TableHead>
          {visibleColumns.map((column) => (
            <TableHead key={column}>{checklistColumnLabels[column]}</TableHead>
          ))}
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {checklists.map((checklist) => (
          <ChecklistsTableRow
            key={checklist.id}
            checklist={checklist}
            visibleColumns={visibleColumns}
            selected={selectedIds.includes(checklist.id)}
            onToggleSelect={onToggleSelect}
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
