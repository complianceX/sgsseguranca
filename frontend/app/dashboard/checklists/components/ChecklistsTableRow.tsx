import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { BrainCircuit, Printer, Download, Mail, Pencil, Trash2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

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
    case 'Conforme': return <CheckCircle className="h-4 w-4 text-[var(--ds-color-success)]" />;
    case 'Pendente': return <Clock className="h-4 w-4 text-[var(--ds-color-warning)]" />;
    case 'Não Conforme': return <AlertTriangle className="h-4 w-4 text-[var(--ds-color-danger)]" />;
    default: return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Conforme': return 'bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]';
    case 'Pendente': return 'bg-[color:var(--ds-color-warning)]/16 text-[var(--ds-color-warning)]';
    case 'Não Conforme': return 'bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]';
    default: return 'bg-[color:var(--ds-color-surface-muted)]/60 text-[var(--ds-color-text-secondary)]';
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
    <TableRow>
      <TableCell className="text-[var(--ds-color-text-secondary)]">
        {format(new Date(checklist.data), 'dd/MM/yyyy', { locale: ptBR })}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-[var(--ds-color-text-primary)]">{checklist.titulo}</div>
          {checklist.is_modelo && (
            <span className="rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-action-primary)]">
              Modelo
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-[var(--ds-color-text-secondary)]">
        <div className="flex flex-col">
          {checklist.equipamento && <span>{checklist.equipamento}</span>}
          {checklist.maquina && <span>{checklist.maquina}</span>}
          {!checklist.equipamento && !checklist.maquina && <span>-</span>}
        </div>
      </TableCell>
      <TableCell>
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
          getStatusClass(checklist.status)
        )}>
          {getStatusIcon(checklist.status)}
          {checklist.status}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onAiAnalysis(checklist.id)}
            disabled={analyzingId === checklist.id}
            className={cn(
              "text-[var(--ds-color-action-primary)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]",
              analyzingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Analisar com GST"
          >
            <BrainCircuit className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onPrint(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[var(--ds-color-text-secondary)]",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Imprimir"
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDownloadPdf(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[var(--ds-color-text-secondary)]",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Baixar PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onSendEmail(checklist)}
            disabled={printingId === checklist.id}
            className={cn(
              "text-[var(--ds-color-text-secondary)]",
              printingId === checklist.id && "animate-pulse opacity-50"
            )}
            title="Enviar por E-mail"
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Link
            href={`/dashboard/checklists/edit/${checklist.id}`}
            className={buttonVariants({ size: 'icon', variant: 'ghost' })}
            title="Editar Checklist"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onDelete(checklist.id)}
            className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
            title="Excluir Checklist"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

ChecklistsTableRow.displayName = 'ChecklistsTableRow';
