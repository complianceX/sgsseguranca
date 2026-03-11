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
  Printer,
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
import { openPdfForPrint } from '@/lib/print-utils';

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
  downloadWeeklyBundle?: (filters: {
    company_id?: string;
    year: number;
    week: number;
  }) => Promise<Blob>;
  companyOptions?: Array<{ id: string; name: string }>;
}

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export function StoredFilesPanel({
  title,
  description,
  listStoredFiles,
  getPdfAccess,
  downloadWeeklyBundle,
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
  const canBuildWeeklyBundle = Boolean(downloadWeeklyBundle && year && week);

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
          setFiles((data || []).map((file) => normalizeStoredFileItem(file)));
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

  const handleDownloadWeeklyBundle = async () => {
    if (!downloadWeeklyBundle || !year || !week) {
      toast.error('Selecione ano e semana para gerar o pacote.');
      return;
    }

    try {
      const blob = await downloadWeeklyBundle({
        company_id: companyId || undefined,
        year: Number(year),
        week: Number(week),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slugify(title)}-semana-${year}-${String(week).padStart(2, '0')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Pacote semanal gerado com sucesso.');
    } catch (error) {
      console.error('Erro ao baixar pacote semanal:', error);
      toast.error('Não foi possível gerar o pacote semanal.');
    }
  };

  const handlePrintWeeklyBundle = async () => {
    if (!downloadWeeklyBundle || !year || !week) {
      toast.error('Selecione ano e semana para imprimir o pacote.');
      return;
    }

    try {
      const blob = await downloadWeeklyBundle({
        company_id: companyId || undefined,
        year: Number(year),
        week: Number(week),
      });
      const url = URL.createObjectURL(blob);
      openPdfForPrint(url, () => {
        toast.info('Pop-up bloqueado. Abrimos o pacote na mesma aba.');
      });
    } catch (error) {
      console.error('Erro ao imprimir pacote semanal:', error);
      toast.error('Não foi possível abrir o pacote semanal para impressão.');
    }
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
            aria-label="Filtrar arquivos por empresa"
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
            aria-label="Filtrar arquivos por ano"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            className={inputClassName}
          />
          <input
            type="number"
            min={1}
            max={53}
            placeholder="Semana ISO"
            aria-label="Filtrar arquivos por semana ISO"
            value={week}
            onChange={(event) => setWeek(event.target.value)}
            className={inputClassName}
          />
          <select
            aria-label="Quantidade de arquivos por página"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
            className={inputClassName}
          >
            <option value={10}>10 / página</option>
            <option value={25}>25 / página</option>
            <option value={50}>50 / página</option>
          </select>
          <div className="flex flex-wrap gap-2 xl:col-span-2">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={handleExportCsv}
            >
              Exportar CSV
            </Button>
            {downloadWeeklyBundle ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<Download className="h-4 w-4" />}
                  onClick={handleDownloadWeeklyBundle}
                  disabled={!canBuildWeeklyBundle}
                >
                  Baixar semana
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<Printer className="h-4 w-4" />}
                  onClick={handlePrintWeeklyBundle}
                  disabled={!canBuildWeeklyBundle}
                >
                  Imprimir semana
                </Button>
              </>
            ) : null}
          </div>
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

function normalizeStoredFileItem(file: unknown): StoredFileItem {
  const record = (file ?? {}) as Record<string, unknown>;
  return {
    entityId: String(
      record.entityId ??
        record.id ??
        record.ddsId ??
        record.aprId ??
        record.ptId ??
        record.checklistId ??
        '',
    ),
    title: String(
      record.title ??
        record.titulo ??
        record.tema ??
        record.numero ??
        record.codigo_nc ??
        'Documento',
    ),
    date:
      (record.date as string | Date | undefined) ??
      (record.data as string | Date | undefined) ??
      (record.data_inicio as string | Date | undefined) ??
      (record.data_hora_inicio as string | Date | undefined) ??
      (record.data_identificacao as string | Date | undefined) ??
      new Date().toISOString(),
    companyId: String(record.companyId ?? record.company_id ?? ''),
    fileKey: String(record.fileKey ?? ''),
    folderPath: String(record.folderPath ?? ''),
    originalName: String(record.originalName ?? record.fileKey ?? 'documento.pdf'),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
