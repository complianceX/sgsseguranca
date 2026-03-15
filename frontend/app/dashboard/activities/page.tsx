'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { activitiesService, Activity } from '@/services/activitiesService';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const loadActivities = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await activitiesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setActivities(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      setLoadError('Nao foi possivel carregar a lista de atividades.');
      toast.error('Erro ao carregar lista de atividades.');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) {
      return;
    }

    try {
      await activitiesService.delete(id);
      toast.success('Atividade excluida com sucesso');
      if (activities.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      void loadActivities();
    } catch (error) {
      console.error('Erro ao excluir atividade:', error);
      toast.error('Erro ao excluir atividade. Verifique dependencias e tente novamente.');
    }
  }

  const summary = useMemo(
    () => ({
      total,
      visiveis: activities.length,
      comDescricao: activities.filter((activity) => Boolean(activity.descricao)).length,
    }),
    [activities, total],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando atividades"
        description="Buscando cadastro base e relacionamentos disponiveis."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar atividades"
        description={loadError}
        action={
          <Button type="button" onClick={() => void loadActivities()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Cadastro operacional"
      title="Atividades"
      description="Gerencie o cadastro base de atividades utilizado nos fluxos operacionais do sistema."
      icon={<ClipboardList className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/activities/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova atividade
        </Link>
      }
      metrics={[
        {
          label: 'Total cadastrado',
          value: summary.total,
          note: 'Base total disponível no tenant.',
        },
        {
          label: 'Resultados visíveis',
          value: summary.visiveis,
          note: 'Retorno do filtro aplicado na listagem.',
          tone: 'primary',
        },
        {
          label: 'Com descrição',
          value: summary.comDescricao,
          note: 'Registros mais completos para uso operacional.',
          tone: 'success',
        },
      ]}
      toolbarTitle="Base de atividades"
      toolbarDescription={`${total} atividade(s) encontrada(s) com busca por nome e descrição.`}
      toolbarContent={
        <div className="ds-list-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar atividades..."
            aria-label="Buscar atividades por nome ou descrição"
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
      {activities.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nenhuma atividade encontrada"
            description={
              deferredSearchTerm
                ? 'Nenhum resultado corresponde ao filtro aplicado.'
                : 'Ainda nao existem atividades cadastradas para este tenant.'
            }
            action={
              !deferredSearchTerm ? (
                <Link href="/dashboard/activities/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova atividade
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Data de criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell className="font-medium text-[var(--ds-color-text-primary)]">{activity.nome}</TableCell>
                <TableCell className="text-[var(--ds-color-text-secondary)]">{activity.descricao || '—'}</TableCell>
                <TableCell>{new Date(activity.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link
                      href={`/dashboard/activities/edit/${activity.id}`}
                      className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                      title="Editar atividade"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(activity.id)}
                      className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                      title="Excluir atividade"
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
    </ListPageLayout>
  );
}
