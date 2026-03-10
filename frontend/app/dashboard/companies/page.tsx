'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { companiesService, Company } from '@/services/companiesService';
import { Building2, Plus, Pencil, Trash2, Search } from 'lucide-react';
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

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    loadCompanies();
  }, [page, deferredSearchTerm]);

  async function loadCompanies() {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await companiesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setCompanies(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
      setLoadError('Nao foi possivel carregar a lista de empresas.');
      toast.error('Erro ao carregar lista de empresas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) {
      return;
    }

    try {
      await companiesService.delete(id);
      toast.success('Empresa excluida com sucesso');
      if (companies.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      loadCompanies();
    } catch (error) {
      console.error('Erro ao excluir empresa:', error);
      toast.error('Erro ao excluir empresa. Verifique dependencias e tente novamente.');
    }
  }

  const summary = useMemo(
    () => ({
      total,
      visiveis: companies.length,
      ativas: companies.filter((company) => company.status).length,
    }),
    [companies, total],
  );

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando empresas"
        description="Buscando cadastro corporativo e vínculos disponíveis."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar empresas"
        description={loadError}
        action={
          <Button type="button" onClick={loadCompanies}>
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
              <Building2 className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">Governança corporativa</span>
              <CardTitle className="text-2xl">Empresas</CardTitle>
              <CardDescription>
                Gerencie as empresas vinculadas ao ambiente multi-tenant do sistema.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/companies/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova empresa
          </Link>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats">
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Total cadastrado</CardDescription>
            <CardTitle className="ds-crud-stat__value">{summary.total}</CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Empresas disponíveis no recorte atual.
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
              Correspondências da busca por razão social e CNPJ.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--success">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Empresas ativas</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-success)]">
              {summary.ativas}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Estruturas prontas para operação no sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <CardHeader className="ds-crud-filter-header md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de empresas</CardTitle>
            <CardDescription>
              {total} empresa(s) encontrada(s) com busca por razão social, CNPJ e responsável.
            </CardDescription>
          </div>
          <div className="ds-crud-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar empresas..."
              aria-label="Buscar empresas por razão social ou CNPJ"
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
          {companies.length === 0 ? (
            <EmptyState
              title="Nenhuma empresa encontrada"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda nao existem empresas cadastradas para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/companies/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova empresa
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                      {company.razao_social}
                    </TableCell>
                    <TableCell>{company.cnpj}</TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">
                      {company.responsavel}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/dashboard/companies/edit/${company.id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Editar empresa"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(company.id)}
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                          title="Excluir empresa"
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
