'use client';

import { useState, useEffect } from 'react';
import { ddsService, Dds } from '@/services/ddsService';
import { Plus, Pencil, Trash2, Search, Users, Mail, Printer, Download, Folder, Copy, FileSpreadsheet, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateDdsPdf } from '@/lib/pdf/ddsGenerator';
import { signaturesService } from '@/services/signaturesService';
import { SendMailModal } from '@/components/SendMailModal';

export default function DdsPage() {
  const [ddsList, setDdsList] = useState<Dds[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState<'all' | 'model' | 'regular'>('all');
  const [storedFiles, setStoredFiles] = useState<
    Array<{
      ddsId: string;
      tema: string;
      data: string;
      companyId: string;
      fileKey: string;
      folderPath: string;
      originalName: string;
    }>
  >([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileYear, setFileYear] = useState<string>('');
  const [fileWeek, setFileWeek] = useState<string>('');
  const [fileCompanyId, setFileCompanyId] = useState<string>('');
  const [filesPage, setFilesPage] = useState(1);
  const [filesPageSize, setFilesPageSize] = useState(10);

  // Mail Modal States
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);

  useEffect(() => {
    loadDds();
  }, []);

  useEffect(() => {
    loadStoredFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileCompanyId, fileYear, fileWeek]);

  useEffect(() => {
    setFilesPage(1);
  }, [fileCompanyId, fileYear, fileWeek, filesPageSize]);

  async function loadDds() {
    try {
      setLoading(true);
      const data = await ddsService.findAll();
      setDdsList(data);
    } catch (error) {
      console.error('Erro ao carregar DDS:', error);
      toast.error('Erro ao carregar lista de DDS.');
    } finally {
      setLoading(false);
    }
  }

  async function loadStoredFiles() {
    try {
      setLoadingFiles(true);
      const yearValue = fileYear ? Number(fileYear) : undefined;
      const weekValue = fileWeek ? Number(fileWeek) : undefined;
      const data = await ddsService.listStoredFiles({
        company_id: fileCompanyId || undefined,
        year: yearValue,
        week: weekValue,
      });
      setStoredFiles(data);
    } catch (error) {
      console.error('Erro ao carregar arquivos DDS:', error);
      toast.error('Erro ao carregar arquivos salvos de DDS.');
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este DDS?')) {
      try {
        await ddsService.delete(id);
        setDdsList(ddsList.filter(d => d.id !== id));
        toast.success('DDS excluído com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir DDS:', error);
        toast.error('Erro ao excluir DDS. Verifique se existem dependências e tente novamente.');
      }
    }
  }

  const handlePrint = async (dds: Dds) => {
    try {
      toast.info('Preparando impressão...');
      const signatures = await signaturesService.findByDocument(dds.id, 'DDS');
      const base64 = await generateDdsPdf(dds, signatures, { save: false, output: 'base64' });
      if (base64) {
        const byteCharacters = atob(base64 as string);
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
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF para impressão.');
    }
  };

  const handleEmail = async (dds: Dds) => {
    try {
      const signatures = await signaturesService.findByDocument(dds.id, 'DDS');
      const base64 = await generateDdsPdf(dds, signatures, { save: false, output: 'base64' });
      
      if (base64) {
        setSelectedDoc({
          name: `DDS - ${dds.tema}`,
          filename: `DDS_${dds.tema.replace(/\s+/g, '_')}.pdf`,
          base64: base64 as string,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao preparar e-mail:', error);
      toast.error('Erro ao preparar e-mail com o documento.');
    }
  };

  const handleDownloadStoredPdf = async (ddsId: string) => {
    try {
      const access = await ddsService.getPdfAccess(ddsId);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Erro ao obter link do PDF:', error);
      toast.error('Não foi possível abrir o PDF armazenado.');
    }
  };

  const handleCopyFolderPath = async (folderPath: string) => {
    try {
      await navigator.clipboard.writeText(folderPath);
      toast.success('Caminho da pasta copiado.');
    } catch (error) {
      console.error('Erro ao copiar caminho:', error);
      toast.error('Não foi possível copiar o caminho da pasta.');
    }
  };

  const handleExportStoredFilesCsv = () => {
    if (storedFiles.length === 0) {
      toast.error('Não há arquivos para exportar.');
      return;
    }

    const headers = ['dds_id', 'data', 'tema', 'company_id', 'folder_path', 'file_key', 'original_name'];
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = storedFiles.map((file) =>
      [
        file.ddsId,
        format(new Date(file.data), 'yyyy-MM-dd'),
        file.tema,
        file.companyId,
        file.folderPath,
        file.fileKey,
        file.originalName,
      ]
        .map((item) => escapeCsv(String(item ?? '')))
        .join(','),
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `dds-files-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso.');
  };

  const handleCopyPdfLink = async (ddsId: string) => {
    try {
      const access = await ddsService.getPdfAccess(ddsId);
      await navigator.clipboard.writeText(access.url);
      toast.success('Link do PDF copiado.');
    } catch (error) {
      console.error('Erro ao copiar link do PDF:', error);
      toast.error('Não foi possível copiar o link do PDF.');
    }
  };

  const companyOptions = Array.from(
    new Map(
      ddsList
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company?.razao_social || item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const totalFilesPages = Math.max(1, Math.ceil(storedFiles.length / filesPageSize));
  const pagedStoredFiles = storedFiles.slice(
    (filesPage - 1) * filesPageSize,
    filesPage * filesPageSize,
  );

  const filteredDds = ddsList.filter((dds) => {
    const matchesTerm = dds.tema.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesTerm) return false;
    if (modelFilter === 'model') return Boolean(dds.is_modelo);
    if (modelFilter === 'regular') return !dds.is_modelo;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Diálogo Diário de Segurança (DDS)</h1>
          <p className="text-gray-500">Gerencie os registros de DDS realizados.</p>
        </div>
        <Link
          href="/dashboard/dds/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo DDS
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Arquivos DDS (Storage)</h2>
              <p className="text-sm text-gray-500">PDFs salvos automaticamente por empresa/ano/semana.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select
                value={fileCompanyId}
                onChange={(e) => setFileCompanyId(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                aria-label="Filtro empresa"
              >
                <option value="">Todas empresas</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={2020}
                max={2100}
                placeholder="Ano"
                value={fileYear}
                onChange={(e) => setFileYear(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <input
                type="number"
                min={1}
                max={53}
                placeholder="Semana ISO"
                value={fileWeek}
                onChange={(e) => setFileWeek(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <select
                value={filesPageSize}
                onChange={(e) => setFilesPageSize(Number(e.target.value))}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                aria-label="Itens por página"
              >
                <option value={10}>10 / página</option>
                <option value={25}>25 / página</option>
                <option value={50}>50 / página</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleExportStoredFilesCsv}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Tema</th>
                <th className="px-6 py-3 font-medium">Pasta</th>
                <th className="px-6 py-3 font-medium">Arquivo</th>
                <th className="px-6 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingFiles ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                  </td>
                </tr>
              ) : storedFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    Nenhum PDF de DDS encontrado para este filtro.
                  </td>
                </tr>
              ) : (
                pagedStoredFiles.map((file) => (
                  <tr key={`${file.ddsId}-${file.fileKey}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500">
                      {format(new Date(file.data), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{file.tema}</td>
                    <td className="px-6 py-4 text-xs text-gray-600">
                      <div className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1">
                        <Folder className="h-3 w-3" />
                        <span>{file.folderPath}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyFolderPath(file.folderPath)}
                          className="rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                          title="Copiar caminho da pasta"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700">{file.originalName}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadStoredPdf(file.ddsId)}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyPdfLink(file.ddsId)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                          title="Copiar link do PDF"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Copiar link
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loadingFiles && storedFiles.length > 0 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-600">
            <span>
              Página {filesPage} de {totalFilesPages} ({storedFiles.length} arquivo(s))
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilesPage((prev) => Math.max(1, prev - 1))}
                disabled={filesPage <= 1}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-3 w-3" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setFilesPage((prev) => Math.min(totalFilesPages, prev + 1))}
                disabled={filesPage >= totalFilesPages}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próxima
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-gray-400" />
              </span>
              <input
                type="text"
                placeholder="Pesquisar DDS..."
                className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Filtro</span>
              <select
                aria-label="Filtro de DDS"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value as 'all' | 'model' | 'regular')}
              >
                <option value="all">Todos</option>
                <option value="regular">Registros</option>
                <option value="model">Modelos</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-3 font-medium">Data</th>
                <th className="px-6 py-3 font-medium">Tema</th>
                <th className="px-6 py-3 font-medium">Participantes</th>
                <th className="px-6 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                  </td>
                </tr>
              ) : filteredDds.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-gray-500">
                    Nenhum DDS encontrado.
                  </td>
                </tr>
              ) : (
                filteredDds.map((dds) => (
                  <tr key={dds.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500">
                      {format(new Date(dds.data), 'dd/MM/yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-gray-900">{dds.tema}</div>
                        {dds.is_modelo && (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            Modelo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {dds.participants?.length || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handlePrint(dds)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Imprimir DDS"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEmail(dds)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Enviar por E-mail"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/dashboard/dds/edit/${dds.id}`}
                          className="text-amber-600 hover:text-amber-800"
                          title="Editar DDS"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(dds.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Excluir DDS"
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
