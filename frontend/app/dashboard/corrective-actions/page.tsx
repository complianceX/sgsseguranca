'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  correctiveActionsService,
  CorrectiveAction,
  CorrectiveActionPriority,
  CorrectiveActionStatus,
} from '@/services/correctiveActionsService';
import { usersService, User } from '@/services/usersService';
import { Plus, CheckCircle2, AlertTriangle, Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { handleApiError } from '@/lib/error-handler';
import { useCachedFetch } from '@/hooks/useCachedFetch';
import { CACHE_KEYS } from '@/lib/cache/cacheKeys';

const SUMMARY_CACHE_TTL_MS = 60_000;
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

const STATUS_OPTIONS: Array<{ value: CorrectiveActionStatus; label: string }> = [
  { value: 'open', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'cancelled', label: 'Cancelada' },
];

export default function CorrectiveActionsPage() {
  const summaryCache = useCachedFetch(
    CACHE_KEYS.correctiveActionsSummary,
    correctiveActionsService.findSummary,
    SUMMARY_CACHE_TTL_MS,
  );
  const slaOverviewCache = useCachedFetch(
    CACHE_KEYS.correctiveActionsSlaOverview,
    correctiveActionsService.getSlaOverview,
    SUMMARY_CACHE_TTL_MS,
  );
  const slaBySiteCache = useCachedFetch(
    CACHE_KEYS.correctiveActionsSlaBySite,
    correctiveActionsService.getSlaBySite,
    SUMMARY_CACHE_TTL_MS,
  );
  const usersLookupCache = useCachedFetch(
    CACHE_KEYS.correctiveActionsUsersLookup,
    usersService.findPaginated,
    LOOKUP_CACHE_TTL_MS,
  );
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    done: 0,
    overdue: 0,
  });
  const [slaOverview, setSlaOverview] = useState({
    overdue: 0,
    dueSoon: 0,
    criticalOpen: 0,
    highOpen: 0,
    avgResolutionDays: '0.0',
  });
  const [slaBySite, setSlaBySite] = useState<
    Array<{ site: string; total: number; overdue: number; criticalOpen: number }>
  >([]);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    due_date: string;
    priority: CorrectiveActionPriority;
    responsible_user_id: string;
  }>({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    responsible_user_id: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [actionsPage, summaryData, usersPage, overview, bySite] =
        await Promise.all([
        correctiveActionsService.findPaginated({ page, limit: 10 }),
        summaryCache.fetch(),
        usersLookupCache.fetch({ page: 1, limit: 100 }),
        slaOverviewCache.fetch(),
        slaBySiteCache.fetch(),
      ]);
      setActions(actionsPage.data);
      setTotal(actionsPage.total);
      setLastPage(actionsPage.lastPage);
      setSummary(summaryData);
      setUsers(usersPage.data);
      setSlaOverview(overview);
      setSlaBySite(bySite);
    } catch (error) {
      handleApiError(error, 'Ações corretivas');
    } finally {
      setLoading(false);
    }
  }, [page, slaBySiteCache, slaOverviewCache, summaryCache, usersLookupCache]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!form.title || !form.description || !form.due_date) {
      toast.error('Preencha título, descrição e prazo.');
      return;
    }
    try {
      setSaving(true);
      await correctiveActionsService.create({
        ...form,
        due_date: new Date(form.due_date).toISOString(),
        responsible_user_id: form.responsible_user_id || undefined,
      });
      summaryCache.invalidate();
      slaOverviewCache.invalidate();
      slaBySiteCache.invalidate();
      toast.success('Ação corretiva criada.');
      setForm({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        responsible_user_id: '',
      });
      if (page !== 1) {
        setPage(1);
      } else {
        await loadData();
      }
    } catch (error) {
      handleApiError(error, 'Ação corretiva');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: CorrectiveActionStatus) => {
    try {
      await correctiveActionsService.updateStatus(id, status);
      summaryCache.invalidate();
      slaOverviewCache.invalidate();
      slaBySiteCache.invalidate();
      await loadData();
    } catch (error) {
      handleApiError(error, 'Status CAPA');
    }
  };

  const handleRunEscalation = async () => {
    try {
      const result = await correctiveActionsService.runSlaEscalation();
      summaryCache.invalidate();
      slaOverviewCache.invalidate();
      slaBySiteCache.invalidate();
      toast.success(
        `Escalonamento executado: ${result.overdueActions} CAPAs vencidas, ${result.notificationsCreated} notificações.`,
      );
      await loadData();
    } catch (error) {
      handleApiError(error, 'Escalonamento SLA');
    }
  };

  const statusLabel = (status: CorrectiveActionStatus) =>
    STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

  const priorityVariant = (priority: CorrectiveActionPriority) =>
    priority === 'critical'
      ? 'danger'
      : priority === 'high'
        ? 'warning'
        : priority === 'medium'
          ? 'accent'
          : 'neutral';

  return (
    <div className="space-y-6">
      <Card tone="elevated">
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Ações Corretivas (CAPA)</h1>
        <p className="text-[var(--ds-color-text-secondary)]">Planeje, acompanhe e conclua ações corretivas com SLA.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={summary.total} icon={<Clock3 className="h-4 w-4" />} />
        <KpiCard label="Abertas" value={summary.open} icon={<Plus className="h-4 w-4" />} />
        <KpiCard label="Em andamento" value={summary.inProgress} icon={<Clock3 className="h-4 w-4" />} />
        <KpiCard label="Concluídas" value={summary.done} icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Vencidas" value={summary.overdue} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <Card tone="elevated">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
            SLA Operacional
          </h2>
          <Button type="button" onClick={handleRunEscalation} variant="outline" size="sm">
            Executar escalonamento agora
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Vencidas" value={slaOverview.overdue} icon={<AlertTriangle className="h-4 w-4" />} />
          <KpiCard label="Vencem em 48h" value={slaOverview.dueSoon} icon={<Clock3 className="h-4 w-4" />} />
          <KpiCard label="Críticas abertas" value={slaOverview.criticalOpen} icon={<AlertTriangle className="h-4 w-4" />} />
          <KpiCard label="Altas abertas" value={slaOverview.highOpen} icon={<Clock3 className="h-4 w-4" />} />
          <KpiCard label="Média resolução (dias)" value={Number(slaOverview.avgResolutionDays)} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>
      </Card>

      <Card tone="elevated">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">Nova ação</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Input
            className="md:col-span-2"
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <Input
            className="md:col-span-2"
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <Input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
          />
          <select
            className="h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
            value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as CorrectiveActionPriority }))}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <select
            className="h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)] md:col-span-2"
            value={form.responsible_user_id}
            onChange={(e) => setForm((prev) => ({ ...prev, responsible_user_id: e.target.value }))}
          >
            <option value="">Responsável (opcional)</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </select>
          <Button type="button" onClick={handleCreate} disabled={saving} loading={saving}>
            {saving ? 'Salvando...' : 'Criar CAPA'}
          </Button>
        </div>
      </Card>

      <Card tone="elevated" padding="none" className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Escalonamento</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[var(--ds-color-text-secondary)]">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[var(--ds-color-text-secondary)]">
                  Nenhuma ação corretiva cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              actions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell className="font-medium">{action.title}</TableCell>
                  <TableCell>{new Date(action.due_date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant(action.priority) as 'danger' | 'warning' | 'accent' | 'neutral'}>
                      {action.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{action.responsible_user?.nome || action.responsible_name || '-'}</TableCell>
                  <TableCell>Nível {action.escalation_level || 0}</TableCell>
                  <TableCell>
                    <select
                      className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-2 py-1 text-xs text-[var(--ds-color-text-primary)]"
                      value={action.status}
                      onChange={(e) => handleStatusChange(action.id, e.target.value as CorrectiveActionStatus)}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 text-xs text-[var(--ds-color-text-secondary)]">{statusLabel(action.status)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null}
      </Card>

      <Card tone="elevated">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
          SLA por Obra/Setor
        </h2>
        {slaBySite.length === 0 ? (
          <p className="text-sm text-[var(--ds-color-text-secondary)]">Sem dados de SLA por obra ainda.</p>
        ) : (
          <div className="space-y-2">
            {slaBySite.map((item) => (
              <div
                key={item.site}
                className="flex items-center justify-between rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--ds-color-text-primary)]">{item.site}</span>
                <span className="text-[var(--ds-color-text-secondary)]">
                  Total: {item.total} | Vencidas: {item.overdue} | Críticas abertas: {item.criticalOpen}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)]/92 p-3 shadow-[var(--ds-shadow-sm)]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-[var(--ds-color-text-primary)]">{value}</div>
    </div>
  );
}




