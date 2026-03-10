'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { machinesService, Machine } from '@/services/machinesService';
import { Plus, Pencil, Trash2, Search, ClipboardList, Truck } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
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

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    loadMachines();
  }, [page, deferredSearchTerm]);

  async function loadMachines() {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await machinesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setMachines(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar máquinas:', error);
      setLoadError('Nao foi possivel carregar a lista de maquinas.');
      toast.error('Erro ao carregar lista de máquinas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta máquina?')) {
      return;
    }

    try {
      await machinesService.delete(id);
      toast.success('Máquina excluida com sucesso');
      if (machines.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      loadMachines();
    } catch (error) {
      console.error('Erro ao excluir máquina:', error);
      toast.error('Erro ao excluir máquina. Verifique dependencias e tente novamente.');
    }
  }

  const summary = useMemo(
    () => ({
      total,
      visiveis: machines.length,
      comPlaca: machines.filter((machine) => Boolean(machine.placa)).length,
    }),
    [machines, total],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando máquinas"
        description="Buscando inventário de máquinas e dados operacionais."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar máquinas"
        description={loadError}
        action={
          <Button type="button" onClick={loadMachines}>
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
              <Truck className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">Inventário de equipamentos</span>
              <CardTitle className="text-2xl">Máquinas</CardTitle>
              <CardDescription>
                Gerencie o inventário de máquinas e acesse rapidamente o fluxo de checklist por equipamento.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/machines/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova máquina
          </Link>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats">
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Total cadastrado</CardDescription>
            <CardTitle className="ds-crud-stat__value">{summary.total}</CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Inventário total cadastrado por tenant.
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
              Equipamentos retornados pela busca atual.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--success">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Com placa</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-success)]">
              {summary.comPlaca}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Identificação formal pronta para rastreio.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <CardHeader className="ds-crud-filter-header md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de máquinas</CardTitle>
            <CardDescription>
              {total} máquina(s) encontrada(s) com busca por nome e placa.
            </CardDescription>
          </div>
          <div className="ds-crud-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <Input
              type="text"
              placeholder="Buscar máquinas..."
              aria-label="Buscar máquinas por nome ou placa"
              className="pl-10"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {machines.length === 0 ? (
            <EmptyState
              title="Nenhuma máquina encontrada"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda nao existem máquinas cadastradas para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/machines/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova máquina
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Horímetro atual</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {machines.map((machine) => (
                  <TableRow key={machine.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {machine.nome}
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {machine.placa || '—'}
                    </TableCell>
                    <TableCell>{machine.horimetro_atual || '0'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/dashboard/checklist-models/new?maquina=${encodeURIComponent(machine.nome)}&company_id=${machine.company_id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Montar checklist"
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/dashboard/machines/edit/${machine.id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Editar máquina"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(machine.id)}
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                          title="Excluir máquina"
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
