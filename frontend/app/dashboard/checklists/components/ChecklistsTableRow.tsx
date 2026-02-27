import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BrainCircuit, Printer, Download, Mail, Pencil, Trash2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

interface ChecklistsTableRowProps {
  checklist: Checklist;
  analyzingId: string | null;
  printingId: string | null;
  onAiAnalysis: (id: string) => void;
  onPrint: (checklist: Checklist) => void;
  onDownloadPdf: (checklist: Checklist) => void;
  onSendEmail: (checklist: Checklist) => void;
  onDelete: (id: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Conforme': return <CheckCircle className="h-4 w-4 text-white" />;
    case 'Pendente': return <Clock className="h-4 w-4 text-[#111827]" />;
    case 'Não Conforme': return <AlertTriangle className="h-4 w-4 text-white" />;
    default: return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Conforme': return 'bg-[#16A34A] text-white';
    case 'Pendente': return 'bg-[#FACC15] text-[#111827]';
    case 'Não Conforme': return 'bg-[#DC2626] text-white';
    default: return 'bg-[#E5E7EB] text-[#374151]';
  }
};

export const ChecklistsTableRow = React.memo(({
  checklist,
  analyzingId,
  printingId,
  onAiAnalysis,
  onPrint,
  onDownloadPdf,
  onSendEmail,
  onDelete
}: ChecklistsTableRowProps) => {
  return (
    <tr className="hover:bg-[#EEF2FF]">
      <td className="px-6 py-4 text-[#6B7280]">
        {format(new Date(checklist.data), 'dd/MM/yyyy', { locale: ptBR })}
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-[#1F2F4A]">{checklist.titulo}</div>
          {checklist.is_modelo && (
            <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#1E3A8A]">
              Modelo
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 text-[#6B7280]">
        <div className="flex flex-col">
          {checklist.equipamento && <span>{checklist.equipamento}</span>}
          {checklist.maquina && <span>{checklist.maquina}</span>}
          {!checklist.equipamento && !checklist.maquina && <span>-</span>}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
          getStatusClass(checklist.status)
        )}>
          {getStatusIcon(checklist.status)}
          {checklist.status}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onAiAnalysis(checklist.id)}
            disabled={analyzingId === checklist.id}
            className={cn(
              "text-[#2563EB] hover:text-[#1E40AF] transition-colors",
              analyzingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Analisar com COMPLIANCE X"
          >
            <BrainCircuit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onPrint(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[#374151] hover:text-[#1F2937] transition-colors",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Imprimir"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDownloadPdf(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[#374151] hover:text-[#1F2937] transition-colors",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Baixar PDF"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSendEmail(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[#374151] hover:text-[#1F2937] transition-colors",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Enviar por E-mail"
          >
            <Mail className="h-4 w-4" />
          </button>
          <Link
            href={`/dashboard/checklists/edit/${checklist.id}`}
            className="text-[#2563EB] hover:text-[#1E40AF]"
            title="Editar Checklist"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => onDelete(checklist.id)}
            className="text-[#DC2626] hover:text-[#B91C1C]"
            title="Excluir Checklist"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
});

ChecklistsTableRow.displayName = 'ChecklistsTableRow';
