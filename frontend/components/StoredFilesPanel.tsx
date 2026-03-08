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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState, InlineLoadingState } from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

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
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
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
        .map((item) => escapeCsv(String(item ?? '')))
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
    <Card tone="default" padding="none">
      <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            className={inputClassName}
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
            onChange={(event) => setYear(event.target.value)}
            className={inputClassName}
          />
          <input
            type="number"
            min={1}
            max={53}
            placeholder="Semana ISO"
            value={week}
            onChange={(event) => setWeek(event.target.value)}
            className={inputClassName}
          />
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={inputClassName}
          >
            <option value={10}>10 / página</option>
            <option value={25}>25 / página</option>
            <option value={50}>50 / página</option>
          </select>
          <Button
            type="button"
            variant="outline"
            leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
            onClick={handleExportCsv}
          >
            Exportar CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="mt-0">
        {loading ? (
          <InlineLoadingState label="Carregando arquivos salvos" />
        ) : paged.length === 0 ? (
          <EmptyState
            title="Nenhum arquivo encontrado"
            description="Não há arquivos armazenados para o filtro aplicado."
            compact
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Pasta</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((file) => (
                  <TableRow key={`${file.entityId}-${file.fileKey}`}>
                    <TableCell>
                      {format(new Date(file.date), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {file.title}
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2 rounded-[var(--ds-radius-sm)] bg-[color:var(--ds-color-surface-muted)]/45 px-2 py-1 text-xs text-[var(--ds-color-text-secondary)]">
                        <Folder className="h-3 w-3" />
                        <span>{file.folderPath}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCopyFolder(file.folderPath)}
                          title="Copiar caminho"
                          className="h-6 w-6"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {file.originalName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          leftIcon={<Download className="h-3.5 w-3.5" />}
                          onClick={() => handleDownload(file.entityId)}
                        >
                          Baixar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          leftIcon={<Link2 className="h-3.5 w-3.5" />}
                          onClick={() => handleCopyLink(file.entityId)}
                        >
                          Copiar link
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between text-sm text-[var(--ds-color-text-muted)]">
              <span>
                Página <span className="font-semibold text-[var(--ds-color-text-primary)]">{page}</span>{' '}
                de <span className="font-semibold text-[var(--ds-color-text-primary)]">{totalPages}</span>{' '}
                • {files.length} arquivo(s)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leftIcon={<ChevronLeft className="h-4 w-4" />}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  rightIcon={<ChevronRight className="h-4 w-4" />}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
