'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toolsService, Tool } from '@/services/toolsService';
import { Plus, Pencil, Trash2, Search, ClipboardList, Wrench } from 'lucide-react';
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
import { PaginationControls } from '@/components/PaginationControls';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const loadTools = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await toolsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setTools(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar ferramentas:', error);
      setLoadError('Nao foi possivel carregar a lista de ferramentas.');
      toast.error('Erro ao carregar lista de ferramentas.');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta ferramenta?')) {
      return;
    }

    try {
      await toolsService.delete(id);
      toast.success('Ferramenta excluida com sucesso');
      if (tools.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      void loadTools();
    } catch (error) {
      console.error('Erro ao excluir ferramenta:', error);
      toast.error('Erro ao excluir ferramenta. Verifique dependencias e tente novamente.');
    }
  }

  const summary = useMemo(
    () => ({
      total,
      visiveis: tools.length,
      comSerie: tools.filter((tool) => Boolean(tool.numero_serie)).length,
    }),
    [tools, total],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando ferramentas"
        description="Buscando cadastro patrimonial e inventário operacional."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar ferramentas"
        description={loadError}
        action={
          <Button type="button" onClick={() => void loadTools()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="ds-crud-page">
      <Card tone="elevated" padding="lg" className="ds-crud-hero">
        <CardHeader className="ds-crud-hero__header md:flex-row md:items-start md:justify-between">
          <div className="ds-crud-hero__lead">
            <div className="ds-crud-hero__icon">
              <Wrench className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">Inventário de ferramentas</span>
              <CardTitle className="text-2xl">Ferramentas</CardTitle>
              <CardDescription>
                Gerencie o inventário de ferramentas e acesse rapidamente o fluxo de checklist por equipamento.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/tools/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova ferramenta
          </Link>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats">
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Total cadastrado</CardDescription>
            <CardTitle className="ds-crud-stat__value">{summary.total}</CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Ferramentas registradas no inventário.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--primary">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Resultados visíveis</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-action-primary)]">
              {summary.visiveis}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Retorno atual da listagem operacional.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--success">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Com número de série</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-success)]">
              {summary.comSerie}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Itens prontos para rastreabilidade patrimonial.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <CardHeader className="ds-crud-filter-header md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de ferramentas</CardTitle>
            <CardDescription>
              {total} ferramenta(s) encontrada(s) com busca por nome e número de série.
            </CardDescription>
          </div>
          <div className="ds-crud-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar ferramentas..."
              aria-label="Buscar ferramentas por nome ou número de série"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {tools.length === 0 ? (
            <EmptyState
              title="Nenhuma ferramenta encontrada"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda nao existem ferramentas cadastradas para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/tools/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova ferramenta
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Número de série</TableHead>
                  <TableHead>Data de criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tools.map((tool) => (
                  <TableRow key={tool.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {tool.nome}
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {tool.numero_serie || '—'}
                    </TableCell>
                    <TableCell>{new Date(tool.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/dashboard/checklist-models/new?equipamento=${encodeURIComponent(tool.nome)}&company_id=${tool.company_id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Montar checklist"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/dashboard/tools/edit/${tool.id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Editar ferramenta"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(tool.id)}
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                          title="Excluir ferramenta"
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
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>
    </div>
  );
}
