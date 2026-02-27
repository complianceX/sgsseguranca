'use client';

import React from 'react';
import { Pt } from '@/services/ptsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2, Printer, Mail, Download, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PtsTableRowProps {
  pt: Pt;
  onDelete: (id: string) => void;
  onPrint: (id: string) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Aprovada': return <CheckCircle className="h-4 w-4 text-white" />;
    case 'Pendente': return <Clock className="h-4 w-4 text-[#111827]" />;
    case 'Cancelada': return <AlertTriangle className="h-4 w-4 text-white" />;
    case 'Encerrada': return <CheckCircle className="h-4 w-4 text-white" />;
    case 'Expirada': return <AlertTriangle className="h-4 w-4 text-white" />;
    default: return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Aprovada': return 'bg-[#16A34A] text-white';
    case 'Pendente': return 'bg-[#FACC15] text-[#111827]';
    case 'Cancelada': return 'bg-[#DC2626] text-white';
    case 'Encerrada': return 'bg-[#6B7280] text-white';
    case 'Expirada': return 'bg-[#F97316] text-white';
    default: return 'bg-[#E5E7EB] text-[#374151]';
  }
};

export const PtsTableRow = React.memo(({ pt, onDelete, onPrint, onSendEmail, onDownloadPdf, onApprove, onReject }: PtsTableRowProps) => {
  const isApproved = pt.status === 'Aprovada';
  return (
    <tr className="group transition-colors hover:bg-[#EEF2FF]">
      <td className="px-6 py-4">
        <div className="font-medium text-[#1F2F4A]">{pt.numero}</div>
        <div className="text-[#6B7280]">{pt.titulo}</div>
      </td>
      <td className="px-6 py-4 text-[#6B7280]">
        {format(new Date(pt.data_hora_inicio), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
      </td>
      <td className="px-6 py-4 text-[#6B7280]">
        {format(new Date(pt.data_hora_fim), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
      </td>
      <td className="px-6 py-4">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
          getStatusClass(pt.status)
        )}>
          {getStatusIcon(pt.status)}
          {pt.status}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onPrint(pt.id)}
            className="rounded p-1.5 text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
            title="Imprimir"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSendEmail(pt.id)}
            className="rounded p-1.5 text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
            title="Enviar por E-mail"
          >
            <Mail className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDownloadPdf(pt.id)}
            className="rounded p-1.5 text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
            title="Baixar PDF"
          >
            <Download className="h-4 w-4" />
          </button>
          {!isApproved && (
            <>
              <button
                type="button"
                onClick={() => onApprove(pt.id)}
                className="rounded px-2 py-1 text-xs font-semibold text-[#166534] transition-colors hover:bg-[#DCFCE7]"
                title="Aprovar PT"
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => onReject(pt.id)}
                className="rounded px-2 py-1 text-xs font-semibold text-[#991B1B] transition-colors hover:bg-[#FEE2E2]"
                title="Reprovar PT"
              >
                Reprovar
              </button>
            </>
          )}
          <Link
            href={`/dashboard/pts/edit/${pt.id}`}
            className={cn(
              'rounded p-1.5 transition-colors',
              isApproved
                ? 'pointer-events-none text-gray-300'
                : 'text-[#374151] hover:bg-[#E5E7EB]',
            )}
            title={isApproved ? 'PT aprovada: edição bloqueada' : 'Editar PT'}
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(pt.id)}
            className="rounded p-1.5 text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
            title="Excluir PT"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

PtsTableRow.displayName = 'PtsTableRow';
