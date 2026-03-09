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
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await companiesService.findAll();
      setCompanies(data);
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
      setCompanies((current) => current.filter((company) => company.id !== id));
      toast.success('Empresa excluida com sucesso');
    } catch (error) {
      console.error('Erro ao excluir empresa:', error);
      toast.error('Erro ao excluir empresa. Verifique dependencias e tente novamente.');
    }
  }

  const filteredCompanies = useMemo(
    () =>
      companies.filter((company) =>
        company.razao_social.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        company.cnpj.includes(deferredSearchTerm),
      ),
    [companies, deferredSearchTerm],
  );

  const summary = useMemo(
    () => ({
      total: companies.length,
      visiveis: filteredCompanies.length,
      ativas: companies.filter((company) => company.status).length,
    }),
    [companies, filteredCompanies.length],
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
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-2">
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
            <CardDescription>Empresas ativas</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.ativas}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de empresas</CardTitle>
            <CardDescription>
              {filteredCompanies.length} empresa(s) exibida(s) com busca por razão social e CNPJ.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar empresas..."
              aria-label="Buscar empresas por razão social ou CNPJ"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredCompanies.length === 0 ? (
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
                {filteredCompanies.map((company) => (
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
      </Card>
    </div>
  );
}
