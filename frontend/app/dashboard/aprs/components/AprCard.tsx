'use client';

import React, { useState } from 'react';
import { Apr } from '@/services/aprsService';
import {
  FileText,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Printer,
  Mail,
  Download,
  Pencil,
  Trash2,
  GitBranch,
  PenLine,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { SignatureModal } from '@/components/SignatureModal';
import { SignaturesPanel } from '@/components/SignaturesPanel';
import { signaturesService } from '@/services/signaturesService';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

interface AprCardProps {
  apr: Apr;
  onDelete: (id: string) => void;
  onPrint: (apr: Apr) => void;
  onSendEmail: (id: string) => void;
  onDownloadPdf: (id: string) => void;
  onFinalize: (id: string) => void;
  onReject: (id: string) => void;
  onCreateNewVersion: (id: string) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Aprovada': return <CheckCircle className="h-4 w-4 text-[#16A34A]" />;
    case 'Pendente': return <Clock className="h-4 w-4 text-[#2563EB]" />;
    case 'Cancelada': return <AlertTriangle className="h-4 w-4 text-[#DC2626]" />;
    case 'Encerrada': return <CheckCircle className="h-4 w-4 text-[#6B7280]" />;
    default: return null;
  }
};

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Aprovada': return 'bg-[#16A34A] text-white';
    case 'Pendente': return 'bg-[#2563EB] text-white';
    case 'Cancelada': return 'bg-[#DC2626] text-white';
    case 'Encerrada': return 'bg-[#6B7280] text-white';
    default: return 'bg-gray-100 text-gray-700';
  }
};

export const AprCard = React.memo(
  ({
    apr,
    onDelete,
    onPrint,
    onSendEmail,
    onDownloadPdf,
    onFinalize,
    onReject,
    onCreateNewVersion,
  }: AprCardProps) => {
    const { user, hasPermission } = useAuth();
    const [showSignModal, setShowSignModal] = useState(false);
    const [showSignaturesPanel, setShowSignaturesPanel] = useState(false);

    const handleSignSave = async (signatureData: string, type: string) => {
      try {
        await signaturesService.create({
          document_id: apr.id,
          document_type: 'APR',
          signature_data: signatureData,
          type,
          user_id: user?.id,
          company_id: apr.company_id,
        });
        toast.success('Assinatura registrada com sucesso!');
      } catch {
        toast.error('Erro ao registrar assinatura.');
      }
    };

    const isApproved = apr.status === 'Aprovada';
    const hasCriticalRisk = (apr.classificacao_resumo?.critico || 0) > 0;
    const hasSubstantialRisk = (apr.classificacao_resumo?.substancial || 0) > 0;
    const riskHighlightClass = hasCriticalRisk
      ? 'bg-[#FEE2E2] border-l-4 border-l-[#DC2626]'
      : hasSubstantialRisk
        ? 'bg-[#FFEDD5] border-l-4 border-l-[#F97316]'
        : 'bg-white';

  return (
    <div className={cn(
      "flex flex-col rounded-xl border p-5 transition-all hover:shadow-lg hover:border-blue-200 group animate-in fade-in zoom-in-95 duration-300",
      riskHighlightClass
    )}>
      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-xl bg-blue-50 p-2.5 group-hover:bg-blue-600 transition-colors">
          <FileText className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors" />
        </div>
        <span className={cn('flex items-center space-x-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', getStatusClass(apr.status))}>
          {getStatusIcon(apr.status)}
          <span>{apr.status}</span>
        </span>
      </div>

      <h3 className="mb-1 text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{apr.titulo}</h3>
      <p className="mb-4 flex-1 text-sm text-gray-500 line-clamp-2 italic">
        {apr.descricao || 'Sem descrição.'}
      </p>

      <div className="mb-4 inline-flex w-fit items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
        <GitBranch className="mr-1.5 h-3.5 w-3.5" />
        <span>Versão {apr.versao || 1}</span>
      </div>

      <div className="mb-5 space-y-2 border-t pt-4 text-xs text-gray-500">
        <div className="flex items-center">
          <Calendar className="mr-2 h-3.5 w-3.5 text-gray-400" />
          <span className="font-medium">Emissão:</span> 
          <span className="ml-1">{new Date(apr.data_inicio).toLocaleDateString('pt-BR')}</span>
        </div>
        {apr.data_fim && (
          <div className="flex items-center">
            <Calendar className="mr-2 h-3.5 w-3.5 text-gray-400" />
            <span className="font-medium">Validade:</span>
            <span className="ml-1">{new Date(apr.data_fim).toLocaleDateString('pt-BR')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-1.5 pt-2 border-t border-gray-50">
        {isApproved ? (
          <button
            type="button"
            onClick={() => onCreateNewVersion(apr.id)}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            title="Criar nova versão"
          >
            Nova Versão
          </button>
        ) : hasPermission('can_approve_pt') ? (
          <>
            <button
              type="button"
              onClick={() => onFinalize(apr.id)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              title="Aprovar APR"
            >
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => onReject(apr.id)}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
              title="Reprovar APR"
            >
              Reprovar
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => onPrint(apr)}
          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
          title="Imprimir APR"
        >
          <Printer className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onSendEmail(apr.id)}
          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
          title="Enviar por E-mail"
        >
          <Mail className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDownloadPdf(apr.id)}
          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
          title="Baixar PDF"
        >
          <Download className="h-4 w-4" />
        </button>
        <Link
          href={`/dashboard/aprs/edit/${apr.id}`}
          className={cn(
            'p-1.5 rounded-lg transition-colors',
            isApproved
              ? 'pointer-events-none text-gray-300'
              : 'text-gray-600 hover:bg-gray-100',
          )}
          title={isApproved ? 'APR aprovada: edição bloqueada' : 'Editar APR'}
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => onDelete(apr.id)}
          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
          title="Excluir APR"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowSignModal(true)}
          className="p-1.5 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
          title="Assinar APR"
        >
          <PenLine className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowSignaturesPanel(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          title="Ver assinaturas"
        >
          <Users className="h-4 w-4" />
        </button>
      </div>

      <SignatureModal
        isOpen={showSignModal}
        onClose={() => setShowSignModal(false)}
        onSave={handleSignSave}
        userName={user?.nome ?? 'Usuário'}
      />
      <SignaturesPanel
        isOpen={showSignaturesPanel}
        onClose={() => setShowSignaturesPanel(false)}
        documentId={apr.id}
        documentType="APR"
      />
    </div>
  );
  },
);

AprCard.displayName = 'AprCard';
