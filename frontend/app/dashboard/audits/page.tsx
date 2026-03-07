'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auditsService, Audit } from '@/services/auditsService';
import { Plus, Search, FileText, Edit, Trash2, ClipboardCheck, Download, Mail, Printer } from 'lucide-react';
import { TableRowSkeleton } from '@/components/ui/skeleton';
import { ActionMenu } from '@/components/ActionMenu';
import { PaginationControls } from '@/components/PaginationControls';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateAuditPdf } from '@/lib/pdf/auditGenerator';
import { SendMailModal } from '@/components/SendMailModal';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { correctiveActionsService } from '@/services/correctiveActionsService';
import { openPdfForPrint } from '@/lib/print-utils';

export default function AuditsPage() {
  const router = useRouter();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const fetchAudits = useCallback(async () => {
    try {
      setLoading(true);
      const res = await auditsService.findPaginated({ page, search: searchTerm || undefined });
      setAudits(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch {
      toast.error('Erro ao carregar auditorias');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta auditoria?')) {
      try {
        await auditsService.delete(id);
        toast.success('Auditoria excluída com sucesso');
        fetchAudits();
      } catch {
        toast.error('Erro ao excluir auditoria');
      }
    }
  };

  const handleDownloadPdf = async (audit: Audit) => {
    try {
      toast.info('Gerando PDF...');
      const fullAudit = await auditsService.findOne(audit.id);
      await generateAuditPdf(fullAudit);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF da auditoria.');
    }
  };

  const handlePrint = async (audit: Audit) => {
    try {
      toast.info('Preparando impressão...');
      const fullAudit = await auditsService.findOne(audit.id);
      const result = await generateAuditPdf(fullAudit, { save: false, output: 'base64' }) as { base64: string };
      if (result?.base64) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        openPdfForPrint(fileURL, () => {
          toast.info('Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.');
        });
      }
    } catch (error) {
      console.error('Erro ao imprimir:', error);
      toast.error('Erro ao preparar impressão da auditoria.');
    }
  };

  const handleSendEmail = async (audit: Audit) => {
    try {
      toast.info('Preparando documento...');
      const fullAudit = await auditsService.findOne(audit.id);
      const result = await generateAuditPdf(fullAudit, { save: false, output: 'base64' }) as { filename: string; base64: string };
      if (result?.base64) {
        setSelectedDoc({
          name: audit.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao preparar e-mail:', error);
      toast.error('Erro ao preparar o documento para envio.');
    }
  };

  const handleCreateCapa = async (audit: Audit) => {
    try {
      await correctiveActionsService.createFromAudit(audit.id);
      toast.success('CAPA criada a partir da auditoria.');
    } catch (error) {
      console.error('Erro ao criar CAPA da auditoria:', error);
      toast.error('Não foi possível criar CAPA.');
    }
  };

  const companyOptions = Array.from(
    new Map(
      audits
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Auditorias HSE</h1>
          <p className="text-sm text-gray-500">Gerencie seus relatórios de auditoria e conformidade.</p>
        </div>
        <Link
          href="/dashboard/audits/new"
          className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Relatório</span>
        </Link>
      </div>

      <div className="flex items-center space-x-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por título ou tipo..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
            <tr>
              <th className="px-6 py-4">Título / Tipo</th>
              <th className="px-6 py-4">Site / Unidade</th>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Auditor</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={5} />
              ))
            ) : audits.length > 0 ? (
              audits.map((audit) => (
                <tr key={audit.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="rounded-lg bg-blue-100 p-2">
                        <ClipboardCheck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{audit.titulo}</p>
                        <p className="text-xs text-gray-500">{audit.tipo_auditoria}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-700">{audit.site?.nome || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {format(new Date(audit.data_auditoria), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-gray-700">{audit.auditor?.nome || '-'}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ActionMenu items={[
                      { label: 'Gerar CAPA', icon: <Plus className="h-4 w-4" />, onClick: () => handleCreateCapa(audit) },
                      { label: 'Imprimir', icon: <Printer className="h-4 w-4" />, onClick: () => handlePrint(audit) },
                      { label: 'Enviar E-mail', icon: <Mail className="h-4 w-4" />, onClick: () => handleSendEmail(audit) },
                      { label: 'Baixar PDF', icon: <Download className="h-4 w-4" />, onClick: () => handleDownloadPdf(audit) },
                      { label: 'Editar', icon: <Edit className="h-4 w-4" />, onClick: () => router.push(`/dashboard/audits/edit/${audit.id}`) },
                      { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, onClick: () => handleDelete(audit.id), variant: 'danger' },
                    ]} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <FileText className="mb-2 h-12 w-12 text-gray-200" />
                    <p>Nenhuma auditoria encontrada.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!loading && (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        )}
      </div>

      <StoredFilesPanel
        title="Arquivos Auditoria (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={auditsService.listStoredFiles}
        getPdfAccess={auditsService.getPdfAccess}
        companyOptions={companyOptions}
      />

      {selectedDoc && (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            setSelectedDoc(null);
          }}
          documentName={selectedDoc.name}
          filename={selectedDoc.filename}
          base64={selectedDoc.base64}
        />
      )}
    </div>
  );
}
