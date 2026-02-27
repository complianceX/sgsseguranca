import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { ChecklistsTableRow } from './ChecklistsTableRow';

interface ChecklistsTableProps {
  checklists: Checklist[];
  loading: boolean;
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
  loading,
  analyzingId,
  printingId,
  onAiAnalysis,
  onPrint,
  onDownloadPdf,
  onSendEmail,
  onDelete
}: ChecklistsTableProps) => {
  return (
    <div className="sst-card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase">
          <tr>
            <th className="px-6 py-3 font-medium">Data</th>
            <th className="px-6 py-3 font-medium">Título</th>
            <th className="px-6 py-3 font-medium">Ferramenta/Máquina</th>
            <th className="px-6 py-3 font-medium">Status</th>
            <th className="px-6 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {loading ? (
            <tr>
              <td colSpan={5} className="py-10 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent"></div>
              </td>
            </tr>
          ) : checklists.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-10 text-center text-[#6B7280]">
                Nenhum checklist encontrado.
              </td>
            </tr>
          ) : (
            checklists.map((checklist) => (
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
});

ChecklistsTable.displayName = 'ChecklistsTable';
