'use client';

import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import Link from 'next/link';
import {
  Building2,
  Clock3,
  Map as MapIcon,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { usersService, User } from '@/services/usersService';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { InlineCallout } from '@/components/ui/inline-callout';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

const searchInputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

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
      console.error('Erro ao carregar funcionarios:', error);
      setLoadError('Nao foi possivel carregar a lista de funcionarios.');
      toast.error('Erro ao carregar lista de funcionarios.');
    } finally {
      setLoading(false);
    }
  }, [page, deferredSearchTerm]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este funcionario?')) return;

    try {
      await usersService.delete(id);
      setEmployees((current) => current.filter((employee) => employee.id !== id));
      toast.success('Funcionario excluido com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir funcionario:', error);
      toast.error('Erro ao excluir funcionario. Verifique se existem dependencias.');
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
        title="Carregando funcionarios"
        description="Buscando colaboradores, vinculos com empresa e obra, e controles de cadastro."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar funcionarios"
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
    <ListPageLayout
      eyebrow="Base de pessoas"
      title="Funcionarios"
      description="Gerencie colaboradores por empresa, obra/setor e contexto operacional."
      icon={<UserRound className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/employees/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Novo funcionario
        </Link>
      }
      metrics={[
        {
          label: 'Funcionarios no recorte',
          value: total,
          note: 'Colaboradores visiveis nesta pagina.',
        },
        {
          label: 'Empresas no recorte',
          value: summary.companies,
          note: 'Diversidade de vinculo empresarial.',
          tone: 'primary',
        },
        {
          label: 'Vinculados a obra',
          value: summary.withSite,
          note: 'Colaboradores com contexto de campo definido.',
          tone: 'success',
        },
        {
          label: 'Sem obra vinculada',
          value: summary.withoutSite,
          note: 'Pendencias de alocacao operacional.',
          tone: 'warning',
        },
      ]}
      toolbarTitle="Base de funcionarios"
      toolbarDescription={`${displayedEmployees.length} registro(s) visiveis nesta pagina, com administrador geral oculto da visao operacional.`}
      toolbarContent={
        <div className="ds-list-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
          <input
            type="text"
            placeholder="Pesquisar por nome ou CPF"
            aria-label="Pesquisar funcionarios por nome ou CPF"
            className={searchInputClassName}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      }
      footer={
        displayedEmployees.length > 0 ? (
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
        <div className="space-y-4">
          {summary.withoutSite > 0 ? (
            <InlineCallout
              tone="warning"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Atencao operacional"
              description={`Ha ${summary.withoutSite} colaborador(es) sem obra/setor vinculado nesta pagina. Revise a alocacao para evitar inconsistencias em APR, PT e relatorios por obra.`}
            />
          ) : null}

        {displayedEmployees.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhum funcionario encontrado"
              description={
                deferredSearchTerm
                  ? 'Nenhum colaborador corresponde ao filtro aplicado.'
                  : 'Ainda nao existem funcionarios operacionais cadastrados para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/employees/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo funcionario
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
                <TableHead>Funcao</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Obra/Setor</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
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
                          Perfil {employee.profile?.nome ?? 'Nao definido'}
                        </div>
                        <div className="mt-1">
                          <EmployeeAccessPill employee={employee} />
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{employee.cpf}</TableCell>
                  <TableCell className="text-[var(--ds-color-text-secondary)]">
                    {employee.funcao || '-'}
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
                          <span className="text-[var(--ds-color-text-muted)]">Nao vinculada</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/dashboard/employees/${employee.id}`}
                        className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                        title="Editar funcionario"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/workers/timeline?cpf=${employee.cpf ?? ''}`}
                        className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                        title="Abrir timeline operacional"
                      >
                        <Clock3 className="h-4 w-4" />
                      </Link>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(employee.id)}
                        title="Excluir funcionario"
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
  );
}

function EmployeeAccessPill({ employee }: { employee: User }) {
  if (employee.access_status === 'credentialed') {
    return (
      <StatusPill tone="success" size="sm">
        Com acesso
      </StatusPill>
    );
  }

  if (employee.access_status === 'missing_credentials') {
    return (
      <StatusPill tone="warning" size="sm">
        Credencial pendente
      </StatusPill>
    );
  }

  if (employee.access_status === 'no_login') {
    return (
      <StatusPill tone="info" size="sm">
        Sem login
      </StatusPill>
    );
  }

  return (
    <StatusPill tone="neutral" size="sm">
      Não classificado
    </StatusPill>
  );
}

