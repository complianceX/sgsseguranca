'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { ListPageLayout } from '@/components/layout';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ARR_ALLOWED_TRANSITIONS,
  ARR_RISK_LEVEL_LABEL,
  ARR_SEVERITY_LABEL,
  ARR_STATUS_COLORS,
  ARR_STATUS_LABEL,
  arrsService,
  type Arr,
  type ArrStatus,
} from '@/services/arrsService';
import { generateArrPdf } from '@/lib/pdf/arrGenerator';
import { base64ToPdfBlob, base64ToPdfFile } from '@/lib/pdf/pdfFile';
import { openPdfForPrint, openUrlInNewTab } from '@/lib/print-utils';
import { buildPdfFilename } from '@/lib/pdf-system/core/format';
import { cn } from '@/lib/utils';
import { getFormErrorMessage } from '@/lib/error-handler';
import { usePermissions } from '@/hooks/usePermissions';
import { safeFormatDate } from '@/lib/date/safeFormat';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border-subtle)] bg-[color:var(--component-field-bg-subtle)] px-3 py-2.5 text-sm text-[var(--component-field-text)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';

const TURNO_LABEL: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  integral: 'Integral',
};

export default function ArrsPage() {
  const { hasPermission } = usePermissions();
  const canViewArrs = hasPermission('can_view_arrs');
  const canManageArrs = hasPermission('can_manage_arrs');
  const [arrs, setArrs] = useState<Arr[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<'all' | ArrStatus>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage]);

  const loadArrs = useCallback(async () => {
    if (!canViewArrs) {
      setArrs([]);
      setTotal(0);
      setLastPage(1);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError(null);
      const response = await arrsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setArrs(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      setLoadError('Não foi possível carregar a lista de ARRs.');
      toast.error('Erro ao carregar Análises de Risco Rápida.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [canViewArrs, deferredSearchTerm, page, statusFilter]);

  useEffect(() => {
    void loadArrs();
  }, [loadArrs]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  const summary = useMemo(
    () => ({
      total,
      analisadas: arrs.filter((item) => item.status === 'analisada').length,
      tratadas: arrs.filter((item) => item.status === 'tratada').length,
      pdfs: arrs.filter((item) => Boolean(item.pdf_file_key)).length,
    }),
    [arrs, total],
  );

  const getAllowedStatusTransitions = useCallback((arr: Arr): ArrStatus[] => {
    if (arr.pdf_file_key) {
      return [];
    }
    return ARR_ALLOWED_TRANSITIONS[arr.status] || [];
  }, []);

  const buildArrFilename = (arr: Arr) =>
    buildPdfFilename('ARR', arr.titulo || 'arr', arr.data);

  const buildArrForFinalPdf = (arr: Arr): Arr => ({
    ...arr,
    status:
      arr.status === 'arquivada'
        ? 'arquivada'
        : arr.status === 'rascunho'
          ? 'analisada'
          : 'tratada',
  });

  const generateLocalArrPdfBase64 = async (
    arr: Arr,
    options?: { draftWatermark?: boolean; finalMode?: boolean },
  ) => {
    const freshArr = await arrsService.findOne(arr.id);
    const arrForPdf = options?.finalMode
      ? buildArrForFinalPdf(freshArr)
      : freshArr;
    const base64 = await generateArrPdf(arrForPdf, {
      save: false,
      output: 'base64',
      draftWatermark: options?.draftWatermark ?? false,
    });

    if (!base64) {
      throw new Error('Falha ao gerar o PDF da ARR.');
    }

    return String(base64);
  };

  const ensureGovernedPdf = async (arr: Arr) => {
    const existingAccess = await arrsService.getPdfAccess(arr.id);
    if (existingAccess.hasFinalPdf) {
      return existingAccess;
    }

    if (!canManageArrs) {
      throw new Error(
        'Você não tem permissão para emitir o PDF final deste documento.',
      );
    }

    const base64 = await generateLocalArrPdfBase64(arr, {
      draftWatermark: false,
      finalMode: true,
    });
    const file = base64ToPdfFile(base64, buildArrFilename(arr));
    const attachResult = await arrsService.attachFile(arr.id, file);
    await loadArrs();

    if (attachResult.degraded) {
      toast.warning(attachResult.message);
    } else {
      toast.success(attachResult.message);
    }

    return arrsService.getPdfAccess(arr.id);
  };

  const handleOpenGovernedPdf = async (arr: Arr) => {
    try {
      const access = await ensureGovernedPdf(arr);
      if (access.availability !== 'ready' || !access.url) {
        toast.warning(access.message || 'PDF final indisponível no momento.');
        return;
      }

      openUrlInNewTab(access.url);
    } catch (error) {
      console.error(error);
      toast.error(
        getFormErrorMessage(error, {
          fallback:
            'Não foi possível emitir ou abrir o PDF final do documento.',
        }),
      );
    }
  };

  const handlePrint = async (arr: Arr) => {
    try {
      if (canManageArrs) {
        const access = await ensureGovernedPdf(arr);
        if (access.availability !== 'ready' || !access.url) {
          toast.warning(access.message || 'PDF final indisponível no momento.');
          return;
        }

        openPdfForPrint(access.url, () => {
          toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
        });
        return;
      }

      if (arr.pdf_file_key) {
        const access = await arrsService.getPdfAccess(arr.id);
        if (access.availability === 'ready' && access.url) {
          openPdfForPrint(access.url, () => {
            toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
          });
          return;
        }
      }

      const base64 = await generateLocalArrPdfBase64(arr, { draftWatermark: true });
      const fileUrl = URL.createObjectURL(base64ToPdfBlob(base64));
      openPdfForPrint(fileUrl, () => {
        toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
      });
      setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível gerar o PDF para impressão.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManageArrs) {
      toast.error('Você não tem permissão para excluir este documento.');
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir este registro?')) {
      return;
    }

    try {
      await arrsService.delete(id);
      toast.success('Registro excluído com sucesso.');
      if (arrs.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await loadArrs();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível excluir o registro.');
    }
  };

  const handleStatusChange = async (arr: Arr, nextStatus: ArrStatus) => {
    if (!canManageArrs) {
      toast.error('Você não tem permissão para alterar o status.');
      return;
    }

    try {
      const updated = await arrsService.updateStatus(arr.id, nextStatus);
      setArrs((current) =>
        current.map((item) =>
          item.id === arr.id ? { ...item, status: updated.status } : item,
        ),
      );
      toast.success(`Status atualizado para "${ARR_STATUS_LABEL[updated.status]}".`);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível atualizar o status.');
    }
  };

  if (!canViewArrs) {
    return (
      <ErrorState
        title="Acesso negado ao módulo ARR"
        description="Seu perfil não possui permissão para visualizar Análises de Risco Rápida."
      />
    );
  }

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando ARR"
        description="Buscando análises rápidas de risco e o status dos PDFs governados."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar ARR"
        description={loadError}
        action={
          <Button type="button" onClick={loadArrs}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Formalização operacional"
      title="Análise de Risco Rápida"
      description="Módulo leve para registrar condição observada, risco, resposta imediata e PDF final governado."
      icon={<AlertTriangle className="h-5 w-5" />}
      className="pb-6"
      panelClassName="overflow-hidden"
      actions={
        canManageArrs ? (
          <Link
            href="/dashboard/arrs/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova ARR
          </Link>
        ) : null
      }
      metrics={[
        {
          label: 'Total',
          value: summary.total,
          note: `${total} registro(s) no resultado atual`,
          tone: 'primary',
        },
        {
          label: 'Analisadas',
          value: summary.analisadas,
          note: 'contagem da página visível',
          tone: 'warning',
        },
        {
          label: 'Tratadas',
          value: summary.tratadas,
          note: 'documentos já tratados',
          tone: 'success',
        },
        {
          label: 'PDFs finais',
          value: summary.pdfs,
          note: 'governados e disponíveis',
          tone: 'neutral',
        },
      ]}
      toolbarTitle="Registros rápidos de risco"
      toolbarDescription={`${total} documento(s) encontrados com filtros por título, atividade e status.`}
      toolbarActions={<span className="ds-badge ds-badge--warning">Resposta rápida</span>}
      toolbarContent={
        <>
          <div className="ds-list-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Pesquisar ARR"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <select
            className={cn(inputClassName, 'min-w-[180px]')}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | ArrStatus)
            }
          >
            <option value="all">Todos os status</option>
            <option value="rascunho">Rascunho</option>
            <option value="analisada">Analisada</option>
            <option value="tratada">Tratada</option>
            <option value="arquivada">Arquivada</option>
          </select>
        </>
      }
      footer={
        !loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null
      }
    >
      {arrs.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nenhuma ARR encontrada"
            description={
              deferredSearchTerm || statusFilter !== 'all'
                ? 'Nenhum resultado corresponde aos filtros aplicados.'
                : 'Ainda não existem Análises de Risco Rápida para este tenant.'
            }
            action={
              !deferredSearchTerm && statusFilter === 'all' && canManageArrs ? (
                <Link
                  href="/dashboard/arrs/new"
                  className={cn(buttonVariants(), 'inline-flex items-center')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova ARR
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table className="min-w-[1040px]">
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Risco</TableHead>
              <TableHead>Participantes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arrs.map((arr) => {
              const transitions = getAllowedStatusTransitions(arr);
              const isEditLocked =
                Boolean(arr.pdf_file_key) || arr.status === 'arquivada';

              return (
                <TableRow key={arr.id} className="group">
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--ds-color-text-primary)]">
                        {safeFormatDate(arr.data, 'dd/MM/yyyy', { locale: ptBR })}
                      </div>
                      <div className="text-xs text-[var(--ds-color-text-muted)]">
                        {arr.created_at
                          ? `Criado em ${safeFormatDate(arr.created_at, 'dd/MM/yyyy', { locale: ptBR })}`
                          : 'Sem data de criação'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-[var(--ds-color-text-primary)]">
                        {arr.titulo}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ds-color-text-muted)]">
                        <span>{arr.site?.nome || arr.site_id}</span>
                        {arr.turno ? (
                          <span className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-2 py-0.5">
                            {TURNO_LABEL[arr.turno] || arr.turno}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-[var(--ds-color-text-secondary)]">
                        {arr.risco_identificado}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-[var(--ds-color-text-muted)]">
                        <span className="ds-badge ds-badge--warning">
                          {ARR_RISK_LEVEL_LABEL[arr.nivel_risco]}
                        </span>
                        <span className="ds-badge">
                          {ARR_SEVERITY_LABEL[arr.severidade]}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                      <Users className="h-4 w-4" />
                      <div className="space-y-0.5 text-left">
                        <div>{arr.participants?.length || 0}</div>
                        <div className="text-xs text-[var(--ds-color-text-muted)]">
                          {arr.responsavel?.nome || 'Sem responsável'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          ARR_STATUS_COLORS[arr.status],
                        )}
                      >
                        {ARR_STATUS_LABEL[arr.status]}
                      </span>
                      {canManageArrs && transitions.length > 0 ? (
                        <select
                          className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-2.5 py-1.5 text-xs text-[var(--ds-color-text-muted)] shadow-sm"
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              void handleStatusChange(
                                arr,
                                event.target.value as ArrStatus,
                              );
                            }
                          }}
                        >
                          <option value="">Mover para...</option>
                          {transitions.map((status) => (
                            <option key={status} value={status}>
                              {ARR_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity md:opacity-75 md:group-hover:opacity-100">
                      <Button type="button" size="icon" variant="ghost" onClick={() => void handleOpenGovernedPdf(arr)} disabled={!arr.pdf_file_key && !canManageArrs}>
                        <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" onClick={() => void handlePrint(arr)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canManageArrs ? (
                        <>
                          <Link
                            href={isEditLocked ? '#' : `/dashboard/arrs/edit/${arr.id}`}
                            className={cn(buttonVariants({ size: 'icon', variant: 'ghost' }), isEditLocked ? 'cursor-not-allowed opacity-45' : '')}
                            onClick={(event) => {
                              if (isEditLocked) {
                                event.preventDefault();
                                toast.error('Documento travado para edição. Gere um novo registro para alterar o conteúdo.');
                              }
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <Button type="button" size="icon" variant="ghost" className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]" onClick={() => void handleDelete(arr.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ListPageLayout>
  );
}
