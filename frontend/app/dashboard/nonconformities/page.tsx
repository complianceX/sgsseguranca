'use client';

import { useEffect, useState, useCallback, useDeferredValue, useMemo } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Edit,
  FileSpreadsheet,
  Mail,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  nonConformitiesService,
  NonConformity,
  NcStatus,
  NC_ALLOWED_TRANSITIONS,
  NC_STATUS_COLORS,
  NC_STATUS_LABEL,
} from '@/services/nonConformitiesService';
import { correctiveActionsService } from '@/services/correctiveActionsService';
import { generateNonConformityPdf } from '@/lib/pdf/nonConformityGenerator';
import { SendMailModal } from '@/components/SendMailModal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function NonConformitiesPage() {
  const [items, setItems] = useState<NonConformity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await nonConformitiesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setItems(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar nao conformidades:', error);
      setLoadError('Nao foi possivel carregar a lista de nao conformidades.');
      toast.error('Erro ao carregar nao conformidades');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta nao conformidade?')) return;

    try {
      await nonConformitiesService.remove(id);
      toast.success('Nao conformidade excluida com sucesso');
      if (items.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await fetchItems();
    } catch (error) {
      console.error('Erro ao excluir nao conformidade:', error);
      toast.error('Erro ao excluir nao conformidade');
    }
  };

  const handleSendEmail = async (item: NonConformity) => {
    try {
      toast.info('Preparando documento...');
      const fullItem = await nonConformitiesService.findOne(item.id);
      const result = (await generateNonConformityPdf(fullItem, {
        save: false,
        output: 'base64',
      })) as { filename: string; base64: string };

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
      toast.success('CAPA criada a partir da nao conformidade.');
    } catch (error) {
      console.error('Erro ao criar CAPA:', error);
      toast.error('Nao foi possivel criar CAPA.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: NcStatus) => {
    try {
      const updated = await nonConformitiesService.updateStatus(id, newStatus);
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: updated.status } : item,
        ),
      );
      toast.success(`Status atualizado para "${NC_STATUS_LABEL[newStatus]}"`);
    } catch (error) {
      console.error('Erro ao atualizar status da nao conformidade:', error);
      toast.error('Erro ao atualizar status da nao conformidade');
    }
  };

  const summary = useMemo(
    () => ({
      total,
      abertas: items.filter((item) => item.status === NcStatus.ABERTA).length,
      andamento: items.filter((item) => item.status === NcStatus.EM_ANDAMENTO).length,
      aguardando: items.filter((item) => item.status === NcStatus.AGUARDANDO_VALIDACAO).length,
      encerradas: items.filter((item) => item.status === NcStatus.ENCERRADA).length,
    }),
    [items, total],
  );

  const companyOptions = useMemo(
    () =>
      Array.from(
        new Map(
          items
            .filter((item) => item.company_id)
            .map((item) => [item.company_id, item.company_id]),
        ).entries(),
      ).map(([id, name]) => ({ id, name })),
    [items],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando nao conformidades"
        description="Buscando desvios, status, responsaveis e documentos armazenados."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar nao conformidades"
        description={loadError}
        action={
          <Button type="button" onClick={fetchItems}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Desvios e tratativas"
        title="Nao Conformidades"
        description="Registre, acompanhe e encerre desvios operacionais com trilha documental e acao corretiva."
        icon={<AlertTriangle className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() =>
                downloadExcel('/nonconformities/export/excel', 'nao-conformidades.xlsx')
              }
            >
              Exportar Excel
            </Button>
            <Link
              href="/dashboard/nonconformities/new"
              className={cn(buttonVariants({ size: 'sm' }), 'inline-flex items-center')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova nao conformidade
            </Link>
          </div>
        }
        metrics={[
          {
            label: 'Total monitorado',
            value: summary.total,
            note: 'Nao conformidades carregadas nesta pagina.',
          },
          {
            label: 'Abertas na pagina',
            value: summary.abertas,
            note: 'Desvios ainda sem tratativa concluida.',
            tone: 'danger',
          },
          {
            label: 'Em andamento',
            value: summary.andamento + summary.aguardando,
            note: 'Itens em execucao ou aguardando validacao.',
            tone: 'warning',
          },
          {
            label: 'Encerradas',
            value: summary.encerradas,
            note: 'Desvios finalizados no recorte atual.',
            tone: 'success',
          },
        ]}
        toolbarTitle="Base de nao conformidades"
        toolbarDescription={`${total} registro(s) encontrados com busca por codigo, local, tipo e status.`}
        toolbarContent={
          <div className="ds-list-search ds-list-search--wide">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por codigo, local, tipo ou status"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        footer={
          !loading && total > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
            />
          ) : null
        }
      >
        <div className="space-y-4">
          {summary.abertas > 0 || summary.andamento > 0 || summary.aguardando > 0 ? (
            <div className="mx-4 mt-4 rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-danger)]/18 bg-[color:var(--ds-color-danger)]/6 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--ds-color-danger)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">Atencao de tratativa</p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                    Nesta pagina existem {summary.abertas + summary.andamento + summary.aguardando} nao conformidade(s) ainda sem encerramento. Priorize CAPA e validacao para reduzir reincidencia.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nenhuma nao conformidade encontrada"
                description={
                  deferredSearchTerm
                    ? 'Nenhum resultado corresponde ao filtro aplicado.'
                    : 'Ainda nao existem registros de nao conformidade para este tenant.'
                }
                action={
                  !deferredSearchTerm ? (
                    <Link
                      href="/dashboard/nonconformities/new"
                      className={cn(buttonVariants(), 'inline-flex items-center')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Nova nao conformidade
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Local / Setor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Responsavel</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {item.codigo_nc}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)]">
                        {item.tipo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            'inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold',
                            NC_STATUS_COLORS[item.status as NcStatus] ??
                              'bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] border-[var(--ds-color-border-subtle)]',
                          )}
                        >
                          {NC_STATUS_LABEL[item.status as NcStatus] ?? item.status}
                        </span>
                        {NC_ALLOWED_TRANSITIONS[item.status as NcStatus]?.length > 0 ? (
                          <select
                            title="Alterar status"
                            className={cn(inputClassName, 'h-8 px-2 py-1 text-xs')}
                            value=""
                            onChange={(event) => {
                              if (event.target.value) {
                                void handleStatusChange(item.id, event.target.value as NcStatus);
                              }
                            }}
                          >
                            <option value="">Mover para...</option>
                            {NC_ALLOWED_TRANSITIONS[item.status as NcStatus].map((status) => (
                              <option key={status} value={status}>
                                {NC_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{item.local_setor_area}</TableCell>
                    <TableCell>
                      {format(new Date(item.data_identificacao), 'dd/MM/yyyy', {
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell>{item.responsavel_area}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCreateCapa(item)}
                          title="Gerar CAPA"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSendEmail(item)}
                          title="Enviar por e-mail"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Link
                          href={`/dashboard/nonconformities/edit/${item.id}`}
                          className={buttonVariants({
                            size: 'icon',
                            variant: 'ghost',
                          })}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(item.id)}
                          title="Excluir"
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </ListPageLayout>

      <StoredFilesPanel
        title="Arquivos Nao Conformidade (Storage)"
        description="PDFs salvos automaticamente por empresa, ano e semana."
        listStoredFiles={nonConformitiesService.listStoredFiles}
        getPdfAccess={nonConformitiesService.getPdfAccess}
        downloadWeeklyBundle={nonConformitiesService.downloadWeeklyBundle}
        companyOptions={companyOptions}
      />

      {selectedDoc ? (
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
      ) : null}
    </>
  );
}
