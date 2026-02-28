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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { handleApiError } from '@/lib/error-handler';

const STATUS_OPTIONS: Array<{ value: CorrectiveActionStatus; label: string }> = [
  { value: 'open', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'cancelled', label: 'Cancelada' },
];

export default function CorrectiveActionsPage() {
  const [actions, setActions] = useState<CorrectiveAction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [actionsData, summaryData, usersData] = await Promise.all([
        correctiveActionsService.findAll(),
        correctiveActionsService.findSummary(),
        usersService.findAll(),
      ]);
      setActions(actionsData);
      setSummary(summaryData);
      setUsers(usersData);
      const [overview, bySite] = await Promise.all([
        correctiveActionsService.getSlaOverview(),
        correctiveActionsService.getSlaBySite(),
      ]);
      setSlaOverview(overview);
      setSlaBySite(bySite);
    } catch (error) {
      handleApiError(error, 'Ações corretivas');
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.success('Ação corretiva criada.');
      setForm({
        title: '',
        description: '',
        due_date: '',
        priority: 'medium',
        responsible_user_id: '',
      });
      await loadData();
    } catch (error) {
      handleApiError(error, 'Ação corretiva');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: CorrectiveActionStatus) => {
    try {
      await correctiveActionsService.updateStatus(id, status);
      await loadData();
    } catch (error) {
      handleApiError(error, 'Status CAPA');
    }
  };

  const handleRunEscalation = async () => {
    try {
      const result = await correctiveActionsService.runSlaEscalation();
      toast.success(
        `Escalonamento executado: ${result.overdueActions} CAPAs vencidas, ${result.notificationsCreated} notificações.`,
      );
      await loadData();
    } catch (error) {
      handleApiError(error, 'Escalonamento SLA');
    }
  };

  const statusLabel = (status: CorrectiveActionStatus) =>
    STATUS_OPTIONS.find((s) => s.value === status)?.label || status;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Ações Corretivas (CAPA)</h1>
        <p className="text-gray-500">Planeje, acompanhe e conclua ações corretivas com SLA.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Total" value={summary.total} icon={<Clock3 className="h-4 w-4" />} />
        <KpiCard label="Abertas" value={summary.open} icon={<Plus className="h-4 w-4" />} />
        <KpiCard label="Em andamento" value={summary.inProgress} icon={<Clock3 className="h-4 w-4" />} />
        <KpiCard label="Concluídas" value={summary.done} icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Vencidas" value={summary.overdue} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            SLA Operacional
          </h2>
          <button
            type="button"
            onClick={handleRunEscalation}
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
          >
            Executar escalonamento agora
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Vencidas" value={slaOverview.overdue} icon={<AlertTriangle className="h-4 w-4" />} />
          <KpiCard label="Vencem em 48h" value={slaOverview.dueSoon} icon={<Clock3 className="h-4 w-4" />} />
          <KpiCard label="Críticas abertas" value={slaOverview.criticalOpen} icon={<AlertTriangle className="h-4 w-4" />} />
          <KpiCard label="Altas abertas" value={slaOverview.highOpen} icon={<Clock3 className="h-4 w-4" />} />
          <KpiCard label="Média resolução (dias)" value={Number(slaOverview.avgResolutionDays)} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Nova ação</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
          <input
            type="date"
            className="rounded-md border px-3 py-2 text-sm"
            value={form.due_date}
            onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
          />
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={form.priority}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                priority: e.target.value as CorrectiveActionPriority,
              }))
            }
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            value={form.responsible_user_id}
            onChange={(e) =>
              setForm((p) => ({ ...p, responsible_user_id: e.target.value }))
            }
          >
            <option value="">Responsável (opcional)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Criar CAPA'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
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
                <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : actions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                  Nenhuma ação corretiva cadastrada.
                </TableCell>
              </TableRow>
            ) : (
              actions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell className="font-medium">{action.title}</TableCell>
                  <TableCell>{new Date(action.due_date).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>{action.priority}</TableCell>
                  <TableCell>{action.responsible_user?.nome || action.responsible_name || '-'}</TableCell>
                  <TableCell>
                    Nível {action.escalation_level || 0}
                  </TableCell>
                  <TableCell>
                    <select
                      className="rounded-md border px-2 py-1 text-xs"
                      value={action.status}
                      onChange={(e) =>
                        handleStatusChange(action.id, e.target.value as CorrectiveActionStatus)
                      }
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 text-xs text-gray-500">{statusLabel(action.status)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          SLA por Obra/Setor
        </h2>
        {slaBySite.length === 0 ? (
          <p className="text-sm text-gray-500">Sem dados de SLA por obra ainda.</p>
        ) : (
          <div className="space-y-2">
            {slaBySite.map((item) => (
              <div
                key={item.site}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{item.site}</span>
                <span className="text-gray-600">
                  Total: {item.total} | Vencidas: {item.overdue} | Críticas abertas: {item.criticalOpen}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
