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

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    loadMachines();
  }, []);

  async function loadMachines() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await machinesService.findAll();
      setMachines(data);
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
      setMachines((current) => current.filter((machine) => machine.id !== id));
      toast.success('Máquina excluida com sucesso');
    } catch (error) {
      console.error('Erro ao excluir máquina:', error);
      toast.error('Erro ao excluir máquina. Verifique dependencias e tente novamente.');
    }
  }

  const filteredMachines = useMemo(
    () =>
      machines.filter((machine) =>
        machine.nome.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        machine.placa?.toLowerCase().includes(deferredSearchTerm.toLowerCase()),
      ),
    [machines, deferredSearchTerm],
  );

  const summary = useMemo(
    () => ({
      total: machines.length,
      visiveis: filteredMachines.length,
      comPlaca: machines.filter((machine) => Boolean(machine.placa)).length,
    }),
    [machines, filteredMachines.length],
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
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <Truck className="h-5 w-5" />
            </div>
            <div className="space-y-2">
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
            <CardDescription>Com placa</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.comPlaca}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de máquinas</CardTitle>
            <CardDescription>
              {filteredMachines.length} máquina(s) exibida(s) com busca por nome e placa.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar máquinas..."
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredMachines.length === 0 ? (
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
                {filteredMachines.map((machine) => (
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
      </Card>
    </div>
  );
}
