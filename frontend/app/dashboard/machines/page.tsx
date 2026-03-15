'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Pencil, Plus, Search, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { machinesService, Machine } from '@/services/machinesService';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
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

  const loadMachines = useCallback(async () => {
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
      console.error('Erro ao carregar maquinas:', error);
      setLoadError('Nao foi possivel carregar a lista de maquinas.');
      toast.error('Erro ao carregar lista de maquinas.');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void loadMachines();
  }, [loadMachines]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta maquina?')) {
      return;
    }

    try {
      await machinesService.delete(id);
      toast.success('Maquina excluida com sucesso');
      if (machines.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      void loadMachines();
    } catch (error) {
      console.error('Erro ao excluir maquina:', error);
      toast.error('Erro ao excluir maquina. Verifique dependencias e tente novamente.');
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
        title="Carregando maquinas"
        description="Buscando inventario de maquinas e dados operacionais."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar maquinas"
        description={loadError}
        action={
          <Button type="button" onClick={() => void loadMachines()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Inventario de equipamentos"
      title="Maquinas"
      description="Gerencie o inventario de maquinas e acesse rapidamente o fluxo de checklist por equipamento."
      icon={<Truck className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/machines/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova maquina
        </Link>
      }
      metrics={[
        {
          label: 'Total cadastrado',
          value: summary.total,
          note: 'Inventario total cadastrado por tenant.',
        },
        {
          label: 'Resultados visiveis',
          value: summary.visiveis,
          note: 'Equipamentos retornados pela busca atual.',
          tone: 'primary',
        },
        {
          label: 'Com placa',
          value: summary.comPlaca,
          note: 'Identificacao formal pronta para rastreio.',
          tone: 'success',
        },
      ]}
      toolbarTitle="Base de maquinas"
      toolbarDescription={`${total} maquina(s) encontrada(s) com busca por nome e placa.`}
      toolbarContent={
        <div className="ds-list-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
          <Input
            type="text"
            placeholder="Buscar maquinas..."
            aria-label="Buscar maquinas por nome ou placa"
            className="pl-10"
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
      {machines.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nenhuma maquina encontrada"
            description={
              deferredSearchTerm
                ? 'Nenhum resultado corresponde ao filtro aplicado.'
                : 'Ainda nao existem maquinas cadastradas para este tenant.'
            }
            action={
              !deferredSearchTerm ? (
                <Link
                  href="/dashboard/machines/new"
                  className={cn(buttonVariants(), 'inline-flex items-center')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova maquina
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
              <TableHead>Placa</TableHead>
              <TableHead>Horimetro atual</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {machines.map((machine) => (
              <TableRow key={machine.id}>
                <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                  {machine.nome}
                </TableCell>
                <TableCell className="text-[var(--ds-color-text-secondary)]">
                  {machine.placa || '-'}
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
                      title="Editar maquina"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(machine.id)}
                      className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                      title="Excluir maquina"
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
