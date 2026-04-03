'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { companiesService, Company } from '@/services/companiesService';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
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

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  const loadCompanies = useCallback(async () => {
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
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

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
      void loadCompanies();
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
        description="Buscando cadastro corporativo e vinculos disponiveis."
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
          <Button type="button" onClick={() => void loadCompanies()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Governanca corporativa"
      title="Empresas"
      description="Gerencie as empresas vinculadas ao ambiente multi-tenant do sistema."
      icon={<Building2 className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/companies/new" className={buttonVariants()}>
          <Plus className="mr-2 h-4 w-4" />
          Nova empresa
        </Link>
      }
      metrics={[
        {
          label: 'Total cadastrado',
          value: summary.total,
          note: 'Empresas disponiveis no tenant.',
        },
        {
          label: 'Resultados visiveis',
          value: summary.visiveis,
          note: 'Correspondencias da busca atual.',
          tone: 'primary',
        },
        {
          label: 'Empresas ativas',
          value: summary.ativas,
          note: 'Estruturas prontas para operar.',
          tone: 'success',
        },
      ]}
      toolbarTitle="Base de empresas"
      toolbarDescription={`${total} empresa(s) encontrada(s) com busca por razao social, CNPJ e responsavel.`}
      toolbarContent={
        <div className="ds-list-search">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar empresas..."
            aria-label="Buscar empresas por razao social ou CNPJ"
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
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null
      }
    >
      {companies.length === 0 ? (
        <div className="p-6">
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
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razao social</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Responsavel</TableHead>
              <TableHead className="text-right">Acoes</TableHead>
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
    </ListPageLayout>
  );
}




