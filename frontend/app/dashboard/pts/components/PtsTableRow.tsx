'use client';

import React, { useState } from 'react';
import { Pt } from '@/services/ptsService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Mail,
  PenLine,
  Pencil,
  Printer,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SignatureModal } from '@/components/SignatureModal';
import { SignaturesPanel } from '@/components/SignaturesPanel';
import { signaturesService } from '@/services/signaturesService';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';

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
    case 'Aprovada':
      return <CheckCircle className="h-4 w-4 text-white" />;
    case 'Pendente':
      return <Clock className="h-4 w-4 text-white" />;
    case 'Cancelada':
      return <AlertTriangle className="h-4 w-4 text-white" />;
    case 'Encerrada':
      return <CheckCircle className="h-4 w-4 text-white" />;
    case 'Expirada':
      return <AlertTriangle className="h-4 w-4 text-white" />;
    default:
      return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Aprovada':
      return 'bg-[var(--ds-color-success)] text-white';
    case 'Pendente':
      return 'bg-[var(--ds-color-warning)] text-white';
    case 'Cancelada':
      return 'bg-[var(--ds-color-danger)] text-white';
    case 'Encerrada':
      return 'bg-[var(--ds-color-text-muted)] text-white';
    case 'Expirada':
      return 'bg-[color:var(--ds-color-warning-hover)] text-white';
    default:
      return 'bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]';
  }
};

export const PtsTableRow = React.memo(
  ({
    pt,
    onDelete,
    onPrint,
    onSendEmail,
    onDownloadPdf,
    onApprove,
    onReject,
  }: PtsTableRowProps) => {
    const { user, hasPermission } = useAuth();
    const [showSignModal, setShowSignModal] = useState(false);
    const [showSignaturesPanel, setShowSignaturesPanel] = useState(false);
    const isApproved = pt.status === 'Aprovada';

    const handleSignSave = async (signatureData: string, type: string) => {
      try {
        await signaturesService.create({
          document_id: pt.id,
          document_type: 'PT',
          signature_data: signatureData,
          type,
          user_id: user?.id,
          company_id: pt.company_id,
        });
        toast.success('Assinatura registrada com sucesso.');
      } catch {
        toast.error('Erro ao registrar assinatura.');
      }
    };

    return (
      <>
        <TableRow>
          <TableCell>
            <div className="space-y-1">
              <div className="font-medium text-[var(--ds-color-text-primary)]">{pt.numero}</div>
              <div className="text-[var(--ds-color-text-secondary)]">{pt.titulo}</div>
            </div>
          </TableCell>
          <TableCell className="text-[var(--ds-color-text-secondary)]">
            {format(new Date(pt.data_hora_inicio), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
          </TableCell>
          <TableCell className="text-[var(--ds-color-text-secondary)]">
            {format(new Date(pt.data_hora_fim), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
          </TableCell>
          <TableCell>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                getStatusClass(pt.status),
              )}
            >
              {getStatusIcon(pt.status)}
              {pt.status}
            </span>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onPrint(pt.id)}
                title="Imprimir"
              >
                <Printer className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onSendEmail(pt.id)}
                title="Enviar por e-mail"
              >
                <Mail className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onDownloadPdf(pt.id)}
                title="Baixar PDF"
              >
                <Download className="h-4 w-4" />
              </Button>
              {!isApproved && hasPermission('can_approve_pt') ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={() => onApprove(pt.id)} title="Aprovar PT">
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onReject(pt.id)}
                    className="border-[color:var(--ds-color-danger)]/30 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10"
                    title="Reprovar PT"
                  >
                    Reprovar
                  </Button>
                </>
              ) : null}
              <Link
                href={`/dashboard/pts/edit/${pt.id}`}
                className={cn(
                  buttonVariants({ size: 'icon', variant: 'ghost' }),
                  isApproved
                    ? 'pointer-events-none text-[var(--ds-color-text-muted)] opacity-40'
                    : '',
                )}
                title={isApproved ? 'PT aprovada: edição bloqueada' : 'Editar PT'}
              >
                <Pencil className="h-4 w-4" />
              </Link>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => onDelete(pt.id)}
                className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                title="Excluir PT"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setShowSignModal(true)}
                title="Assinar PT"
              >
                <PenLine className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setShowSignaturesPanel(true)}
                title="Ver assinaturas"
              >
                <Users className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>

        <SignatureModal
          isOpen={showSignModal}
          onClose={() => setShowSignModal(false)}
          onSave={handleSignSave}
          userName={user?.nome ?? 'Usuário'}
        />
        <SignaturesPanel
          isOpen={showSignaturesPanel}
          onClose={() => setShowSignaturesPanel(false)}
          documentId={pt.id}
          documentType="PT"
        />
      </>
    );
  },
);

PtsTableRow.displayName = 'PtsTableRow';
