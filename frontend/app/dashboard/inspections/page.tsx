'use client';

import { useState, useEffect } from 'react';
import { inspectionsService, Inspection } from '@/services/inspectionsService';
import { Plus, Search, Edit, Trash2, Loader2, ClipboardList, Download, Mail, Printer } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateInspectionPdf } from '@/lib/pdf/inspectionGenerator';
import { SendMailModal } from '@/components/SendMailModal';

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const fetchInspections = async () => {
    try {
      const data = await inspectionsService.findAll();
      setInspections(data);
    } catch {
      toast.error('Erro ao carregar inspeções');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInspections();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este relatório de inspeção?')) {
      try {
        await inspectionsService.remove(id);
        toast.success('Inspeção excluída com sucesso');
        fetchInspections();
      } catch {
        toast.error('Erro ao excluir inspeção');
      }
    }
  };

  const handleDownloadPdf = async (inspection: Inspection) => {
    try {
      toast.info('Gerando PDF...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      await generateInspectionPdf(fullInspection);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF da inspeção.');
    }
  };

  const handlePrint = async (inspection: Inspection) => {
    try {
      toast.info('Preparando impressão...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      const result = await generateInspectionPdf(fullInspection, { save: false, output: 'base64' }) as { base64: string };
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
      toast.error('Erro ao preparar impressão da inspeção.');
    }
  };

  const handleSendEmail = async (inspection: Inspection) => {
    try {
      toast.info('Preparando documento...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      const result = await generateInspectionPdf(fullInspection, { save: false, output: 'base64' }) as { filename: string; base64: string };
      if (result?.base64) {
        setSelectedDoc({
          name: `${inspection.tipo_inspecao} - ${inspection.setor_area}`,
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

  const filteredInspections = inspections.filter(inspection =>
    inspection.setor_area.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inspection.tipo_inspecao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inspection.site?.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios de Inspeção</h1>
          <p className="text-sm text-gray-500">Gerencie seus relatórios de inspeção de segurança do trabalho.</p>
        </div>
        <Link
          href="/dashboard/inspections/new"
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
            placeholder="Buscar por setor, tipo ou site..."
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
              <th className="px-6 py-4">Setor / Área</th>
              <th className="px-6 py-4">Tipo</th>
              <th className="px-6 py-4">Site / Unidade</th>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Responsável</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-gray-500">Carregando inspeções...</p>
                  </div>
                </td>
              </tr>
            ) : filteredInspections.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2 text-gray-400">
                    <ClipboardList className="h-12 w-12" />
                    <p>Nenhum relatório de inspeção encontrado.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInspections.map((inspection) => (
                <tr key={inspection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {inspection.setor_area}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                      {inspection.tipo_inspecao}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {inspection.site?.nome}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {format(new Date(inspection.data_inspecao), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {inspection.responsavel?.nome}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => handlePrint(inspection)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEmail(inspection)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                        title="Enviar por E-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(inspection)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                        title="Baixar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/dashboard/inspections/edit/${inspection.id}`}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(inspection.id)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
