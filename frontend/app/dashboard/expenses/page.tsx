'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, Receipt, Search, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout, type MetricItem } from '@/components/layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { sitesService, type Site } from '@/services/sitesService';
import { usersService, type User } from '@/services/usersService';
import {
  expensesService,
  EXPENSE_STATUS_LABEL,
  type ExpenseReport,
  type ExpenseReportStatus,
} from '@/services/expensesService';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

function formatMoney(value: string | number | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

export default function ExpensesPage() {
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExpenseReportStatus | ''>('');
  const [periodStartFilter, setPeriodStartFilter] = useState('');
  const [periodEndFilter, setPeriodEndFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    site_id: '',
    responsible_id: '',
    period_start: monthStartIso(),
    period_end: todayIso(),
    notes: '',
  });

  const metrics = useMemo<MetricItem[]>(() => {
    const totalAdvances = reports.reduce(
      (sum, report) => sum + Number(report.totals?.totalAdvances || report.total_advances || 0),
      0,
    );
    const totalExpenses = reports.reduce(
      (sum, report) => sum + Number(report.totals?.totalExpenses || report.total_expenses || 0),
      0,
    );
    return [
      { label: 'Prestações', value: String(total), tone: 'neutral' },
      { label: 'Adiantado', value: formatMoney(totalAdvances), tone: 'primary' },
      { label: 'Despesas', value: formatMoney(totalExpenses), tone: 'warning' },
      { label: 'Saldo', value: formatMoney(totalAdvances - totalExpenses), tone: totalAdvances - totalExpenses >= 0 ? 'success' : 'danger' },
    ];
  }, [reports, total]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [reportsPage, sitesList, usersList] = await Promise.all([
        expensesService.findPaginated({
          page,
          limit: 10,
          site_id: siteFilter || undefined,
          status: statusFilter || undefined,
          period_start: periodStartFilter || undefined,
          period_end: periodEndFilter || undefined,
        }),
        sitesService.findAll(),
        usersService.findAll(),
      ]);
      setReports(reportsPage.data);
      setTotal(reportsPage.total);
      setLastPage(reportsPage.lastPage);
      setSites(sitesList);
      setUsers(usersList);
      setForm((current) => ({
        ...current,
        site_id: current.site_id || sitesList[0]?.id || '',
        responsible_id: current.responsible_id || usersList[0]?.id || '',
      }));
    } catch (error) {
      console.error('Erro ao carregar despesas:', error);
      setLoadError('Não foi possível carregar o módulo de despesas.');
      toast.error('Erro ao carregar despesas.');
    } finally {
      setLoading(false);
    }
  }, [page, periodEndFilter, periodStartFilter, siteFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.site_id || !form.responsible_id) {
      toast.error('Selecione obra e responsável.');
      return;
    }

    try {
      setSubmitting(true);
      const report = await expensesService.create(form);
      toast.success('Prestação de despesas criada.');
      setShowCreate(false);
      await loadData();
      window.location.href = `/dashboard/expenses/${report.id}`;
    } catch (error) {
      console.error('Erro ao criar prestação:', error);
      toast.error('Erro ao criar prestação de despesas.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando despesas"
        description="Buscando prestações, obras e responsáveis disponíveis."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar despesas"
        description={loadError}
        action={<Button onClick={() => void loadData()}>Tentar novamente</Button>}
      />
    );
  }

  return (
    <ListPageLayout
      eyebrow="Campo e Operação"
      title="Despesas por obra"
      description="Controle adiantamentos, comprovantes e fechamento financeiro por obra."
      icon={<WalletCards className="h-5 w-5" />}
      metrics={metrics}
      actions={
        <Button type="button" onClick={() => setShowCreate((value) => !value)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova prestação
        </Button>
      }
      toolbarContent={
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <select
              aria-label="Filtrar por obra"
              className={cn(inputClassName, 'pl-10')}
              value={siteFilter}
              onChange={(event) => {
                setSiteFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas as obras</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.nome}
                </option>
              ))}
            </select>
          </div>
          <select
            aria-label="Filtrar por status"
            className={inputClassName}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ExpenseReportStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            <option value="aberta">Aberta</option>
            <option value="fechada">Fechada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <input
            type="date"
            aria-label="Início do período"
            className={inputClassName}
            value={periodStartFilter}
            onChange={(event) => {
              setPeriodStartFilter(event.target.value);
              setPage(1);
            }}
          />
          <input
            type="date"
            aria-label="Fim do período"
            className={inputClassName}
            value={periodEndFilter}
            onChange={(event) => {
              setPeriodEndFilter(event.target.value);
              setPage(1);
            }}
          />
        </div>
      }
      footer={
        total > 0 ? (
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
      {showCreate ? (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="grid gap-3 border-b border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)] p-4 md:grid-cols-2"
        >
          <select
            className={inputClassName}
            value={form.site_id}
            onChange={(event) => setForm((current) => ({ ...current, site_id: event.target.value }))}
            required
          >
            <option value="">Selecione a obra</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.nome}
              </option>
            ))}
          </select>
          <select
            className={inputClassName}
            value={form.responsible_id}
            onChange={(event) => setForm((current) => ({ ...current, responsible_id: event.target.value }))}
            required
          >
            <option value="">Selecione o responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={inputClassName}
            value={form.period_start}
            onChange={(event) => setForm((current) => ({ ...current, period_start: event.target.value }))}
            required
          />
          <input
            type="date"
            className={inputClassName}
            value={form.period_end}
            onChange={(event) => setForm((current) => ({ ...current, period_end: event.target.value }))}
            required
          />
          <textarea
            className={cn(inputClassName, 'md:col-span-2')}
            rows={3}
            placeholder="Observações da prestação"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              Criar prestação
            </Button>
          </div>
        </form>
      ) : null}

      {reports.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="Nenhuma prestação encontrada"
            description="Crie a primeira prestação para controlar adiantamentos e despesas por obra."
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Adiantado</TableHead>
              <TableHead className="text-right">Despesas</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium">{report.site?.nome || report.site_id}</TableCell>
                <TableCell>{report.responsible?.nome || report.responsible_id}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {report.period_start} a {report.period_end}
                  </span>
                </TableCell>
                <TableCell>{EXPENSE_STATUS_LABEL[report.status]}</TableCell>
                <TableCell className="text-right">{formatMoney(report.totals?.totalAdvances)}</TableCell>
                <TableCell className="text-right">{formatMoney(report.totals?.totalExpenses)}</TableCell>
                <TableCell className="text-right">{formatMoney(report.totals?.balance)}</TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/dashboard/expenses/${report.id}`}
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'inline-flex items-center')}
                  >
                    <Receipt className="mr-2 h-4 w-4" />
                    Abrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListPageLayout>
  );
}
