'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { activitiesService, Activity } from '@/services/activitiesService';
import { ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    loadActivities();
  }, []);

  async function loadActivities() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await activitiesService.findAll();
      setActivities(data);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
      setLoadError('Nao foi possivel carregar a lista de atividades.');
      toast.error('Erro ao carregar lista de atividades.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) {
      return;
    }

    try {
      await activitiesService.delete(id);
      setActivities((current) => current.filter((activity) => activity.id !== id));
      toast.success('Atividade excluida com sucesso');
    } catch (error) {
      console.error('Erro ao excluir atividade:', error);
      toast.error('Erro ao excluir atividade. Verifique dependencias e tente novamente.');
    }
  }

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const term = deferredSearchTerm.toLowerCase();
        return (
          activity.nome.toLowerCase().includes(term) ||
          activity.descricao?.toLowerCase().includes(term)
        );
      }),
    [activities, deferredSearchTerm],
  );

  const summary = useMemo(
    () => ({
      total: activities.length,
      visiveis: filteredActivities.length,
      comDescricao: activities.filter((activity) => Boolean(activity.descricao)).length,
    }),
    [activities, filteredActivities.length],
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
          <Button type="button" onClick={loadActivities}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Atividades</CardTitle>
              <CardDescription>
                Gerencie o cadastro base de atividades utilizado nos fluxos operacionais do sistema.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/activities/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova atividade
          </Link>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total cadastrado</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Resultados visíveis</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">
              {summary.visiveis}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Com descrição</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.comDescricao}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de atividades</CardTitle>
            <CardDescription>
              {filteredActivities.length} atividade(s) exibida(s) com busca por nome e descrição.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar atividades..."
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredActivities.length === 0 ? (
            <EmptyState
              title="Nenhuma atividade encontrada"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda nao existem atividades cadastradas para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/activities/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova atividade
                  </Link>
                ) : undefined
              }
            />
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
                {filteredActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {activity.nome}
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {activity.descricao || '—'}
                    </TableCell>
                    <TableCell>
                      {new Date(activity.createdAt).toLocaleDateString('pt-BR')}
                    </TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
