'use client';

import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import { usersService, User } from '@/services/usersService';
import {
  Building2,
  Map as MapIcon,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PaginationControls } from '@/components/PaginationControls';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const searchInputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await usersService.findPaginated({
        page,
        search: deferredSearchTerm || undefined,
      });
      setEmployees(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
      setLoadError('Nao foi possivel carregar a lista de funcionarios.');
      toast.error('Erro ao carregar lista de funcionários.');
    } finally {
      setLoading(false);
    }
  }, [page, deferredSearchTerm]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este funcionário?')) return;

    try {
      await usersService.delete(id);
      setEmployees((current) => current.filter((employee) => employee.id !== id));
      toast.success('Funcionário excluído com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir funcionário:', error);
      toast.error('Erro ao excluir funcionário. Verifique se existem dependências.');
    }
  }

  const displayedEmployees = useMemo(
    () => employees.filter((employee) => employee.profile?.nome !== 'Administrador Geral'),
    [employees],
  );

  const summary = useMemo(() => {
    const companies = new Set(displayedEmployees.map((employee) => employee.company?.id).filter(Boolean));
    const withSite = displayedEmployees.filter((employee) => employee.site?.id).length;

    return {
      visible: displayedEmployees.length,
      companies: companies.size,
      withSite,
      withoutSite: Math.max(displayedEmployees.length - withSite, 0),
    };
  }, [displayedEmployees]);

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando funcionários"
        description="Buscando colaboradores, vínculos com empresa e obra, e controles de cadastro."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar funcionários"
        description={loadError}
        action={
          <Button type="button" onClick={loadEmployees}>
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
              <UserRound className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Funcionários</CardTitle>
              <CardDescription>
                Gerencie colaboradores por empresa, obra/setor e contexto operacional.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/employees/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo funcionário
          </Link>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Funcionários no recorte</CardDescription>
            <CardTitle className="text-3xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Empresas no recorte</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">
              {summary.companies}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Vinculados à obra</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.withSite}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Sem obra vinculada</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-warning)]">
              {summary.withoutSite}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de funcionários</CardTitle>
            <CardDescription>
              {displayedEmployees.length} registro(s) visíveis nesta página, com administrador geral oculto da visão operacional.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[320px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Pesquisar por nome ou CPF"
              className={searchInputClassName}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {displayedEmployees.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhum funcionário encontrado"
                description={
                  deferredSearchTerm
                    ? 'Nenhum colaborador corresponde ao filtro aplicado.'
                    : 'Ainda não existem funcionários operacionais cadastrados para este tenant.'
                }
                action={
                  !deferredSearchTerm ? (
                    <Link
                      href="/dashboard/employees/new"
                      className={cn(buttonVariants(), 'inline-flex items-center')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo funcionário
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
                  <TableHead>CPF</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Obra/Setor</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--ds-color-text-primary)]">
                            {employee.nome}
                          </div>
                          <div className="text-xs text-[var(--ds-color-text-muted)]">
                            Perfil {employee.profile?.nome ?? 'Não definido'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{employee.cpf}</TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {employee.funcao || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                        <Building2 className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
                        <span>{employee.company?.razao_social || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                        <MapIcon className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
                        <span>
                          {employee.site?.nome || (
                            <span className="text-[var(--ds-color-text-muted)]">Não vinculada</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/employees/${employee.id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Editar funcionário"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(employee.id)}
                          title="Excluir funcionário"
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
        </CardContent>

        {displayedEmployees.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

      {summary.withoutSite > 0 ? (
        <Card tone="muted" padding="md" className="border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/10">
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--ds-color-warning)]" />
              <CardTitle className="text-base">Atenção operacional</CardTitle>
            </div>
            <CardDescription>
              Há {summary.withoutSite} colaborador(es) sem obra/setor vinculado nesta página. Revise a alocação para evitar inconsistências em APR, PT e relatórios por obra.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
