'use client';

import React from 'react';
import { Pt } from '@/services/ptsService';
import { PtsTableRow } from './PtsTableRow';

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

export const PtsTable = React.memo(({ pts, loading, onDelete, onPrint, onSendEmail, onDownloadPdf, onApprove, onReject }: PtsTableProps) => {
  return (
    <div className="sst-card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase">
          <tr>
            <th className="px-6 py-3 font-semibold">Número / Título</th>
            <th className="px-6 py-3 font-semibold">Início</th>
            <th className="px-6 py-3 font-semibold">Fim</th>
            <th className="px-6 py-3 font-semibold">Status</th>
            <th className="px-6 py-3 font-semibold text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {loading ? (
            <tr>
              <td colSpan={5} className="py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent"></div>
                </div>
              </td>
            </tr>
          ) : pts.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-10 text-center text-[#6B7280] font-medium">
                Nenhuma PT encontrada.
              </td>
            </tr>
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
        </tbody>
      </table>
    </div>
  );
});

PtsTable.displayName = 'PtsTable';
