'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Edit, Trash2, Loader2, AlertTriangle, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { nonConformitiesService, NonConformity } from '@/services/nonConformitiesService';
import { correctiveActionsService } from '@/services/correctiveActionsService';
import { generateNonConformityPdf } from '@/lib/pdf/nonConformityGenerator';
import { SendMailModal } from '@/components/SendMailModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';

export default function NonConformitiesPage() {
  const [items, setItems] = useState<NonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const fetchItems = async () => {
    try {
      const data = await nonConformitiesService.findAll();
      setItems(data);
    } catch {
      toast.error('Erro ao carregar não conformidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta não conformidade?')) {
      try {
        await nonConformitiesService.remove(id);
        toast.success('Não conformidade excluída com sucesso');
        fetchItems();
      } catch {
        toast.error('Erro ao excluir não conformidade');
      }
    }
  };

  const handleSendEmail = async (item: NonConformity) => {
    try {
      toast.info('Preparando documento...');
      const fullItem = await nonConformitiesService.findOne(item.id);
      const result = await generateNonConformityPdf(fullItem, { save: false, output: 'base64' }) as { filename: string; base64: string };
      if (result?.base64) {
        setSelectedDoc({
          name: `NC ${item.codigo_nc}`,
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

  const handleCreateCapa = async (item: NonConformity) => {
    try {
      await correctiveActionsService.createFromNonConformity(item.id);
      toast.success('CAPA criada a partir da não conformidade.');
    } catch (error) {
      console.error('Erro ao criar CAPA:', error);
      toast.error('Não foi possível criar CAPA.');
    }
  };

  const filteredItems = items.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.codigo_nc.toLowerCase().includes(term) ||
      item.local_setor_area.toLowerCase().includes(term) ||
      item.tipo.toLowerCase().includes(term) ||
      item.status.toLowerCase().includes(term)
    );
  });

  const companyOptions = Array.from(
    new Map(
      items
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Não Conformidades</h1>
            <p className="text-gray-500">Registre e acompanhe as não conformidades identificadas.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredItems.length} resultado(s)
            </span>
            <Link
              href="/dashboard/nonconformities/new"
              className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Não Conformidade</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por código, local, tipo ou status..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Local / Setor</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-gray-500">Carregando não conformidades...</p>
                </div>
              </TableCell>
            </TableRow>
          ) : filteredItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center">
                <div className="flex flex-col items-center justify-center space-y-2 text-gray-400">
                  <AlertTriangle className="h-12 w-12" />
                  <p>Nenhuma não conformidade encontrada.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            filteredItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium text-gray-900">{item.codigo_nc}</TableCell>
                <TableCell>
                  <span className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {item.tipo}
                  </span>
                </TableCell>
                <TableCell>{item.status}</TableCell>
                <TableCell>{item.local_setor_area}</TableCell>
                <TableCell>
                  {format(new Date(item.data_identificacao), 'dd/MM/yyyy', { locale: ptBR })}
                </TableCell>
                <TableCell>{item.responsavel_area}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => handleCreateCapa(item)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-emerald-600"
                      title="Gerar CAPA"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendEmail(item)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      title="Enviar por E-mail"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                    <Link
                      href={`/dashboard/nonconformities/edit/${item.id}`}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                      title="Editar"
                    >
                      <Edit className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <StoredFilesPanel
        title="Arquivos Não Conformidade (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={nonConformitiesService.listStoredFiles}
        getPdfAccess={nonConformitiesService.getPdfAccess}
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
