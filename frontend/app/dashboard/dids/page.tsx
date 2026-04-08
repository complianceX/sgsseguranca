'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ptBR } from 'date-fns/locale';
import {
  ClipboardList,
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
  DID_ALLOWED_TRANSITIONS,
  DID_STATUS_COLORS,
  DID_STATUS_LABEL,
  didsService,
  type Did,
  type DidStatus,
} from '@/services/didsService';
import { generateDidPdf } from '@/lib/pdf/didGenerator';
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

export default function DidsPage() {
  const { hasPermission } = usePermissions();
  const canManageDids = hasPermission('can_manage_dids');
  const [dids, setDids] = useState<Did[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<'all' | DidStatus>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  const loadDids = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await didsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setDids(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      setLoadError('Não foi possível carregar a lista do Início do Dia.');
      toast.error('Erro ao carregar Diálogos do Início do Dia.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page, statusFilter]);

  useEffect(() => {
    void loadDids();
  }, [loadDids]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  const summary = useMemo(
    () => ({
      total,
      alinhados: dids.filter((item) => item.status === 'alinhado').length,
      executados: dids.filter((item) => item.status === 'executado').length,
      pdfs: dids.filter((item) => Boolean(item.pdf_file_key)).length,
    }),
    [dids, total],
  );

  const getAllowedStatusTransitions = useCallback((did: Did): DidStatus[] => {
    if (did.pdf_file_key) {
      return [];
    }
    return DID_ALLOWED_TRANSITIONS[did.status] || [];
  }, []);

  const buildDidFilename = (did: Did) =>
    buildPdfFilename('DID', did.titulo || 'did', did.data);

  const buildDidForFinalPdf = (did: Did): Did => ({
    ...did,
    status:
      did.status === 'arquivado'
        ? 'arquivado'
        : did.status === 'rascunho'
          ? 'alinhado'
          : 'executado',
  });

  const generateLocalDidPdfBase64 = async (
    did: Did,
    options?: { draftWatermark?: boolean; finalMode?: boolean },
  ) => {
    const freshDid = await didsService.findOne(did.id);
    const didForPdf = options?.finalMode
      ? buildDidForFinalPdf(freshDid)
      : freshDid;
    const base64 = await generateDidPdf(didForPdf, {
      save: false,
      output: 'base64',
      draftWatermark: options?.draftWatermark ?? false,
    });

    if (!base64) {
      throw new Error('Falha ao gerar o PDF do Início do Dia.');
    }

    return String(base64);
  };

  const ensureGovernedPdf = async (did: Did) => {
    const existingAccess = await didsService.getPdfAccess(did.id);
    if (existingAccess.hasFinalPdf) {
      return existingAccess;
    }

    if (!canManageDids) {
      throw new Error(
        'Você não tem permissão para emitir o PDF final deste documento.',
      );
    }

    const base64 = await generateLocalDidPdfBase64(did, {
      draftWatermark: false,
      finalMode: true,
    });
    const file = base64ToPdfFile(base64, buildDidFilename(did));
    const attachResult = await didsService.attachFile(did.id, file);
    await loadDids();

    if (attachResult.degraded) {
      toast.warning(attachResult.message);
    } else {
      toast.success(attachResult.message);
    }

    return didsService.getPdfAccess(did.id);
  };

  const handleOpenGovernedPdf = async (did: Did) => {
    try {
      const access = await ensureGovernedPdf(did);
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

  const handlePrint = async (did: Did) => {
    try {
      if (canManageDids) {
        const access = await ensureGovernedPdf(did);
        if (access.availability !== 'ready' || !access.url) {
          toast.warning(access.message || 'PDF final indisponível no momento.');
          return;
        }

        openPdfForPrint(access.url, () => {
          toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
        });
        return;
      }

      if (did.pdf_file_key) {
        const access = await didsService.getPdfAccess(did.id);
        if (access.availability === 'ready' && access.url) {
          openPdfForPrint(access.url, () => {
            toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
          });
          return;
        }
      }

      const base64 = await generateLocalDidPdfBase64(did, { draftWatermark: true });
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
    if (!canManageDids) {
      toast.error('Você não tem permissão para excluir este documento.');
      return;
    }

    if (!window.confirm('Tem certeza que deseja excluir este registro?')) {
      return;
    }

    try {
      await didsService.delete(id);
      toast.success('Registro excluído com sucesso.');
      if (dids.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await loadDids();
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível excluir o registro.');
    }
  };

  const handleStatusChange = async (did: Did, nextStatus: DidStatus) => {
    if (!canManageDids) {
      toast.error('Você não tem permissão para alterar o status.');
      return;
    }

    try {
      const updated = await didsService.updateStatus(did.id, nextStatus);
      setDids((current) =>
        current.map((item) =>
          item.id === did.id ? { ...item, status: updated.status } : item,
        ),
      );
      toast.success(`Status atualizado para "${DID_STATUS_LABEL[updated.status]}".`);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível atualizar o status.');
    }
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando Início do Dia"
        description="Buscando os registros operacionais do dia e o status dos PDFs governados."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar Início do Dia"
        description={loadError}
        action={
          <Button type="button" onClick={loadDids}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Formalização operacional"
      title="Diálogo do Início do Dia"
      description="Um visual mais limpo para acompanhar DIDs, equipe, status e PDFs finais. O DID continua sendo um registro simples de formalização diária."
      icon={<ClipboardList className="h-5 w-5" />}
      className="pb-6"
      panelClassName="overflow-hidden"
      actions={
        canManageDids ? (
          <Link
            href="/dashboard/dids/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo DID
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
          label: 'Alinhados',
          value: summary.alinhados,
          note: 'contagem da página visível',
          tone: 'warning',
        },
        {
          label: 'Executados',
          value: summary.executados,
          note: 'documentos já concluídos',
          tone: 'success',
        },
        {
          label: 'PDFs finais',
          value: summary.pdfs,
          note: 'governados e disponíveis',
          tone: 'neutral',
        },
      ]}
      toolbarTitle="Registros operacionais"
      toolbarDescription={`${total} documento(s) encontrados com filtros por título e status.`}
      toolbarActions={<span className="ds-badge ds-badge--info">Leitura rápida</span>}
      toolbarContent={
        <>
          <div className="ds-list-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Pesquisar DID"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <select
            className={cn(inputClassName, 'min-w-[180px]')}
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | DidStatus)
            }
          >
            <option value="all">Todos os status</option>
            <option value="rascunho">Rascunho</option>
            <option value="alinhado">Alinhado</option>
            <option value="executado">Executado</option>
            <option value="arquivado">Arquivado</option>
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
      {dids.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nenhum registro encontrado"
            description={
              deferredSearchTerm || statusFilter !== 'all'
                ? 'Nenhum resultado corresponde aos filtros aplicados.'
                : 'Ainda não existem Diálogos do Início do Dia para este tenant.'
            }
            action={
              !deferredSearchTerm && statusFilter === 'all' && canManageDids ? (
                <Link
                  href="/dashboard/dids/new"
                  className={cn(buttonVariants(), 'inline-flex items-center')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo DID
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Atividade</TableHead>
                  <TableHead>Participantes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dids.map((did) => {
                  const transitions = getAllowedStatusTransitions(did);
                  const isEditLocked =
                    Boolean(did.pdf_file_key) || did.status === 'arquivado';

                  return (
                    <TableRow
                      key={did.id}
                      className="group"
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-[var(--ds-color-text-primary)]">
                            {safeFormatDate(did.data, 'dd/MM/yyyy', {
                              locale: ptBR,
                            })}
                          </div>
                          <div className="text-xs text-[var(--ds-color-text-muted)]">
                            {did.created_at
                              ? `Criado em ${safeFormatDate(did.created_at, 'dd/MM/yyyy', {
                                  locale: ptBR,
                                })}`
                              : 'Sem data de criação'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-[var(--ds-color-text-primary)]">
                            {did.titulo}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ds-color-text-muted)]">
                            <span>{did.site?.nome || did.site_id}</span>
                            {did.turno ? (
                              <span className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] px-2 py-0.5">
                                {TURNO_LABEL[did.turno] || did.turno}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-[var(--ds-color-text-secondary)]">
                            {did.atividade_principal}
                          </div>
                          <div className="text-xs text-[var(--ds-color-text-muted)]">
                            {did.frente_trabalho || 'Sem frente detalhada'}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                          <Users className="h-4 w-4" />
                          <div className="space-y-0.5 text-left">
                            <div>{did.participants?.length || 0}</div>
                            <div className="text-xs text-[var(--ds-color-text-muted)]">
                              {did.responsavel?.nome || 'Sem responsável'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                              DID_STATUS_COLORS[did.status],
                            )}
                          >
                            {DID_STATUS_LABEL[did.status]}
                          </span>
                          {canManageDids && transitions.length > 0 ? (
                            <select
                              className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-2.5 py-1.5 text-xs text-[var(--ds-color-text-muted)] shadow-sm"
                              value=""
                              onChange={(event) => {
                                if (event.target.value) {
                                  void handleStatusChange(
                                    did,
                                    event.target.value as DidStatus,
                                  );
                                }
                              }}
                            >
                              <option value="">Mover para...</option>
                              {transitions.map((status) => (
                                <option key={status} value={status}>
                                  {DID_STATUS_LABEL[status]}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-100 transition-opacity md:opacity-75 md:group-hover:opacity-100">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title={
                              did.pdf_file_key
                                ? 'Abrir PDF final governado'
                                : canManageDids
                                  ? 'Emitir PDF final governado'
                                  : 'Somente usuarios com gestao podem emitir o PDF final'
                            }
                            onClick={() => void handleOpenGovernedPdf(did)}
                            disabled={!did.pdf_file_key && !canManageDids}
                          >
                            <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            title="Imprimir documento"
                            onClick={() => void handlePrint(did)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {canManageDids ? (
                            <>
                              <Link
                                href={isEditLocked ? '#' : `/dashboard/dids/edit/${did.id}`}
                                className={cn(
                                  buttonVariants({ size: 'icon', variant: 'ghost' }),
                                  isEditLocked ? 'cursor-not-allowed opacity-45' : '',
                                )}
                                onClick={(event) => {
                                  if (isEditLocked) {
                                    event.preventDefault();
                                    toast.error(
                                      'Documento travado para edição. Gere um novo registro para alterar o conteúdo.',
                                    );
                                  }
                                }}
                                title={
                                  isEditLocked
                                    ? 'Documento travado para edição'
                                    : 'Editar documento'
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Link>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title="Excluir documento"
                                className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                                onClick={() => void handleDelete(did.id)}
                              >
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
