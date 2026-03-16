import React from 'react';
import { Checklist } from '@/services/checklistsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { isAiEnabled } from '@/lib/featureFlags';
import { BrainCircuit, Bot, Printer, Download, Mail, Pencil, Trash2, CheckCircle, Clock, AlertTriangle, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { ChecklistColumnKey } from '../columns';

interface ChecklistsTableRowProps {
  checklist: Checklist;
  visibleColumns: ChecklistColumnKey[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
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
  visibleColumns,
  selected,
  onToggleSelect,
  analyzingId,
  printingId,
  onAiAnalysis,
  onPrint,
  onDownloadPdf,
  onSendEmail,
  onDelete
}: ChecklistsTableRowProps) => {
  const sophieNcHref = (() => {
    const params = new URLSearchParams();
    params.set('documentType', 'nc');
    params.set('source_type', 'checklist');
    params.set('source_reference', checklist.id);
    params.set('title', checklist.titulo || 'Não conformidade oriunda de checklist');
    if (checklist.descricao) {
      params.set('description', checklist.descricao);
    }
    if (checklist.site_id) {
      params.set('site_id', checklist.site_id);
    }
    params.set(
      'source_context',
      `Checklist ${checklist.titulo} com status ${checklist.status}.`,
    );
    return `/dashboard/sst-agent?${params.toString()}`;
  })();

  const renderCell = (column: ChecklistColumnKey) => {
    switch (column) {
      case 'data':
        return (
          <TableCell key="data" className="text-[var(--ds-color-text-secondary)]">
            {format(new Date(checklist.data), 'dd/MM/yyyy', { locale: ptBR })}
          </TableCell>
        );
      case 'titulo':
        return (
          <TableCell key="titulo">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-medium text-[var(--ds-color-text-primary)]">{checklist.titulo}</div>
              {checklist.is_modelo && (
                <span className="rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-action-primary)]">
                  Modelo
                </span>
              )}
            </div>
          </TableCell>
        );
      case 'equipamento':
        return (
          <TableCell key="equipamento" className="text-[var(--ds-color-text-secondary)]">
            <div className="flex flex-col">
              {checklist.equipamento && <span>{checklist.equipamento}</span>}
              {checklist.maquina && <span>{checklist.maquina}</span>}
              {!checklist.equipamento && !checklist.maquina && <span>-</span>}
            </div>
          </TableCell>
        );
      case 'empresa':
        return (
          <TableCell key="empresa" className="text-[var(--ds-color-text-secondary)]">
            {checklist.company?.razao_social || '-'}
          </TableCell>
        );
      case 'inspetor':
        return (
          <TableCell key="inspetor" className="text-[var(--ds-color-text-secondary)]">
            {checklist.inspetor?.nome || '-'}
          </TableCell>
        );
      case 'status':
        return (
          <TableCell key="status">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              getStatusClass(checklist.status)
            )}>
              {getStatusIcon(checklist.status)}
              {checklist.status}
            </span>
          </TableCell>
        );
      default:
        return null;
    }
  };

  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className="w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(checklist.id)}
          className="h-4 w-4 rounded border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-action-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
          aria-label={`Selecionar checklist ${checklist.titulo}`}
        />
      </TableCell>
      {visibleColumns.map(renderCell)}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {checklist.is_modelo && (
            <Link
              href={`/dashboard/checklists/fill/${checklist.id}`}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'gap-1 text-[var(--ds-color-action-primary)] border-[var(--ds-color-action-primary)]/40 hover:bg-[color:var(--ds-color-action-primary)]/8',
              )}
              title="Preencher checklist"
              aria-label={`Preencher checklist ${checklist.titulo}`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Preencher
            </Link>
          )}
          {isAiEnabled() && (
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
              aria-label={`Analisar checklist ${checklist.titulo} com GST`}
            >
              <BrainCircuit className="h-4 w-4" />
            </Button>
          )}
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
            aria-label={`Imprimir checklist ${checklist.titulo}`}
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
            aria-label={`Baixar PDF do checklist ${checklist.titulo}`}
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
            aria-label={`Enviar checklist ${checklist.titulo} por e-mail`}
          >
            <Mail className="h-4 w-4" />
          </Button>
          <Link
            href={sophieNcHref}
            className={buttonVariants({ size: 'icon', variant: 'ghost' })}
            title="Abrir NC com SOPHIE"
            aria-label={`Abrir não conformidade com SOPHIE para checklist ${checklist.titulo}`}
          >
            <Bot className="h-4 w-4 text-[var(--ds-color-warning)]" />
          </Link>
          <Link
            href={`/dashboard/checklists/edit/${checklist.id}`}
            className={buttonVariants({ size: 'icon', variant: 'ghost' })}
            title="Editar Checklist"
            aria-label={`Editar checklist ${checklist.titulo}`}
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
            aria-label={`Excluir checklist ${checklist.titulo}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

ChecklistsTableRow.displayName = 'ChecklistsTableRow';
