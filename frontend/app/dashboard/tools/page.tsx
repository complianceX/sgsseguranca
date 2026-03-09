'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
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
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    loadTools();
  }, []);

  async function loadTools() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await toolsService.findAll();
      setTools(data);
    } catch (error) {
      console.error('Erro ao carregar ferramentas:', error);
      setLoadError('Nao foi possivel carregar a lista de ferramentas.');
      toast.error('Erro ao carregar lista de ferramentas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta ferramenta?')) {
      return;
    }

    try {
      await toolsService.delete(id);
      setTools((current) => current.filter((tool) => tool.id !== id));
      toast.success('Ferramenta excluida com sucesso');
    } catch (error) {
      console.error('Erro ao excluir ferramenta:', error);
      toast.error('Erro ao excluir ferramenta. Verifique dependencias e tente novamente.');
    }
  }

  const filteredTools = useMemo(
    () =>
      tools.filter((tool) =>
        tool.nome.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        tool.numero_serie?.includes(deferredSearchTerm),
      ),
    [tools, deferredSearchTerm],
  );

  const summary = useMemo(
    () => ({
      total: tools.length,
      visiveis: filteredTools.length,
      comSerie: tools.filter((tool) => Boolean(tool.numero_serie)).length,
    }),
    [tools, filteredTools.length],
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
          <Button type="button" onClick={loadTools}>
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
              <Wrench className="h-5 w-5" />
            </div>
            <div className="space-y-2">
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
            <CardDescription>Com número de série</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.comSerie}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de ferramentas</CardTitle>
            <CardDescription>
              {filteredTools.length} ferramenta(s) exibida(s) com busca por nome e número de série.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar ferramentas..."
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredTools.length === 0 ? (
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
                {filteredTools.map((tool) => (
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
      </Card>
    </div>
  );
}
