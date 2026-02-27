'use client';

import { useState, useEffect } from 'react';
import { auditsService, Audit } from '@/services/auditsService';
import { Plus, Search, FileText, Edit, Trash2, ClipboardCheck, Download, Mail, Printer } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateAuditPdf } from '@/lib/pdf/auditGenerator';
import { SendMailModal } from '@/components/SendMailModal';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { correctiveActionsService } from '@/services/correctiveActionsService';

export default function AuditsPage() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const fetchAudits = async () => {
    try {
      const data = await auditsService.findAll();
      setAudits(data);
    } catch {
      toast.error('Erro ao carregar auditorias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

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
        const printWindow = window.open(fileURL);
        if (printWindow) {
          printWindow.print();
        } else {
          toast.error('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.');
        }
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

  const filteredAudits = audits.filter(audit =>
    audit.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    audit.tipo_auditoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
    audit.site?.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
            placeholder="Buscar por título, tipo ou site..."
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
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-4">
                    <div className="h-4 w-full rounded bg-gray-100"></div>
                  </td>
                </tr>
              ))
            ) : filteredAudits.length > 0 ? (
              filteredAudits.map((audit) => (
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
                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => handleCreateCapa(audit)}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 transition-colors"
                        title="Gerar CAPA"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrint(audit)}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEmail(audit)}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                        title="Enviar por E-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(audit)}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                        title="Baixar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/dashboard/audits/edit/${audit.id}`}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(audit.id)}
                        className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
