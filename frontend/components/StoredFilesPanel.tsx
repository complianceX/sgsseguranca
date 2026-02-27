'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  Folder,
  Link2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export interface StoredFileItem {
  entityId: string;
  title: string;
  date: string | Date;
  companyId: string;
  fileKey: string;
  folderPath: string;
  originalName: string;
}

interface StoredFilesPanelProps {
  title: string;
  description: string;
  listStoredFiles: (filters?: {
    company_id?: string;
    year?: number;
    week?: number;
  }) => Promise<StoredFileItem[]>;
  getPdfAccess: (id: string) => Promise<{
    url: string;
  }>;
  companyOptions?: Array<{ id: string; name: string }>;
}

export function StoredFilesPanel({
  title,
  description,
  listStoredFiles,
  getPdfAccess,
  companyOptions = [],
}: StoredFilesPanelProps) {
  const [files, setFiles] = useState<StoredFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState('');
  const [week, setWeek] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalPages = Math.max(1, Math.ceil(files.length / pageSize));
  const paged = useMemo(
    () => files.slice((page - 1) * pageSize, page * pageSize),
    [files, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [year, week, companyId, pageSize]);

  useEffect(() => {
    let mounted = true;
    async function fetchFiles() {
      try {
        setLoading(true);
        const data = await listStoredFiles({
          company_id: companyId || undefined,
          year: year ? Number(year) : undefined,
          week: week ? Number(week) : undefined,
        });
        if (mounted) {
          setFiles(data || []);
        }
      } catch (error) {
        console.error('Erro ao carregar arquivos do storage:', error);
        toast.error('Erro ao carregar arquivos salvos.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchFiles();
    return () => {
      mounted = false;
    };
  }, [companyId, year, week, listStoredFiles]);

  const handleDownload = async (entityId: string) => {
    try {
      const access = await getPdfAccess(entityId);
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Erro ao abrir PDF:', error);
      toast.error('Não foi possível abrir o PDF.');
    }
  };

  const handleCopyFolder = async (folderPath: string) => {
    try {
      await navigator.clipboard.writeText(folderPath);
      toast.success('Caminho da pasta copiado.');
    } catch (error) {
      console.error('Erro ao copiar caminho:', error);
      toast.error('Não foi possível copiar o caminho.');
    }
  };

  const handleCopyLink = async (entityId: string) => {
    try {
      const access = await getPdfAccess(entityId);
      await navigator.clipboard.writeText(access.url);
      toast.success('Link do PDF copiado.');
    } catch (error) {
      console.error('Erro ao copiar link:', error);
      toast.error('Não foi possível copiar o link do PDF.');
    }
  };

  const handleExportCsv = () => {
    if (files.length === 0) {
      toast.error('Não há arquivos para exportar.');
      return;
    }

    const headers = [
      'entity_id',
      'date',
      'title',
      'company_id',
      'folder_path',
      'file_key',
      'original_name',
    ];
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = files.map((file) =>
      [
        file.entityId,
        format(new Date(file.date), 'yyyy-MM-dd'),
        file.title,
        file.companyId,
        file.folderPath,
        file.fileKey,
        file.originalName,
      ]
        .map((item) => esc(String(item ?? '')))
        .join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `storage-files-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso.');
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
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
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="number"
              min={1}
              max={53}
              placeholder="Semana ISO"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value={10}>10 / página</option>
              <option value={25}>25 / página</option>
              <option value={50}>50 / página</option>
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-700">
            <tr>
              <th className="px-6 py-3 font-medium">Data</th>
              <th className="px-6 py-3 font-medium">Título</th>
              <th className="px-6 py-3 font-medium">Pasta</th>
              <th className="px-6 py-3 font-medium">Arquivo</th>
              <th className="px-6 py-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">
                  Nenhum arquivo encontrado para este filtro.
                </td>
              </tr>
            ) : (
              paged.map((file) => (
                <tr key={`${file.entityId}-${file.fileKey}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-gray-500">
                    {format(new Date(file.date), 'dd/MM/yyyy', { locale: ptBR })}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">{file.title}</td>
                  <td className="px-6 py-4 text-xs text-gray-600">
                    <div className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1">
                      <Folder className="h-3 w-3" />
                      <span>{file.folderPath}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyFolder(file.folderPath)}
                        className="rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        title="Copiar caminho"
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
                        onClick={() => handleDownload(file.entityId)}
                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(file.entityId)}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
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

      {!loading && files.length > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-600">
          <span>
            Página {page} de {totalPages} ({files.length} arquivo(s))
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-3 w-3" />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
