'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  serviceOrdersService,
  ServiceOrder,
  OS_STATUS_LABEL,
  OS_STATUS_COLORS,
  OS_ALLOWED_TRANSITIONS,
} from '@/services/serviceOrdersService';
import { usersService } from '@/services/usersService';
import { sitesService } from '@/services/sitesService';
import { downloadExcel } from '@/lib/download-excel';
import {
  Plus,
  FileSpreadsheet,
  ClipboardList,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

type User = { id: string; nome: string };
type Site = { id: string; nome: string };

type FormState = {
  titulo: string;
  descricao_atividades: string;
  responsabilidades: string;
  site_id: string;
  responsavel_id: string;
  data_emissao: string;
  data_inicio: string;
  data_fim_previsto: string;
  riscos_json: string;
  epis_json: string;
};

const INITIAL_FORM: FormState = {
  titulo: '',
  descricao_atividades: '',
  responsabilidades: '',
  site_id: '',
  responsavel_id: '',
  data_emissao: new Date().toISOString().slice(0, 10),
  data_inicio: '',
  data_fim_previsto: '',
  riscos_json: '[]',
  epis_json: '[]',
};

export default function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const summary = {
    total,
    ativo: orders.filter((o) => o.status === 'ativo').length,
    concluido: orders.filter((o) => o.status === 'concluido').length,
    cancelado: orders.filter((o) => o.status === 'cancelado').length,
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const paged = await serviceOrdersService.findPaginated({
        page,
        limit,
        status: filterStatus || undefined,
        site_id: filterSite || undefined,
      });
      setOrders(paged.data);
      setTotal(paged.total);
      setLastPage(paged.lastPage);
    } catch (error) {
      console.error('Erro ao carregar Ordens de Serviço:', error);
      setLoadError('Nao foi possivel carregar as Ordens de Servico.');
      toast.error('Erro ao carregar Ordens de Serviço.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterStatus, filterSite]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [usersPage, sitesPage] = await Promise.all([
          usersService.findPaginated({ page: 1, limit: 100 }),
          sitesService.findPaginated({ page: 1, limit: 100 }),
        ]);

        let nextUsers = usersPage.data as User[];
        if (
          form.responsavel_id &&
          !nextUsers.some((entry) => entry.id === form.responsavel_id)
        ) {
          try {
            const selectedUser = await usersService.findOne(form.responsavel_id);
            nextUsers = dedupeById([selectedUser, ...nextUsers]);
          } catch {
            nextUsers = dedupeById(nextUsers);
          }
        } else {
          nextUsers = dedupeById(nextUsers);
        }

        let nextSites = sitesPage.data as Site[];
        if (form.site_id && !nextSites.some((entry) => entry.id === form.site_id)) {
          try {
            const selectedSite = await sitesService.findOne(form.site_id);
            nextSites = dedupeById([selectedSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }

        setUsers(nextUsers);
        setSites(nextSites);
      } catch {
        setUsers([]);
        setSites([]);
      }
    }

    void loadOptions();
  }, [form.responsavel_id, form.site_id]);

  const openCreate = () => {
    setEditId(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const openEdit = (order: ServiceOrder) => {
    setEditId(order.id);
    setForm({
      titulo: order.titulo,
      descricao_atividades: order.descricao_atividades,
      responsabilidades: order.responsabilidades ?? '',
      site_id: order.site_id ?? '',
      responsavel_id: order.responsavel_id ?? '',
      data_emissao: order.data_emissao?.slice(0, 10) ?? '',
      data_inicio: order.data_inicio?.slice(0, 10) ?? '',
      data_fim_previsto: order.data_fim_previsto?.slice(0, 10) ?? '',
      riscos_json: JSON.stringify(order.riscos_identificados ?? [], null, 2),
      epis_json: JSON.stringify(order.epis_necessarios ?? [], null, 2),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.titulo || !form.descricao_atividades || !form.data_emissao) {
      toast.error('Título, descrição e data de emissão são obrigatórios.');
      return;
    }

    let riscos = null;
    let epis = null;
    try {
      riscos = JSON.parse(form.riscos_json);
      epis = JSON.parse(form.epis_json);
    } catch {
      toast.error('JSON de riscos ou EPIs inválido.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo,
        descricao_atividades: form.descricao_atividades,
        responsabilidades: form.responsabilidades || undefined,
        site_id: form.site_id || undefined,
        responsavel_id: form.responsavel_id || undefined,
        data_emissao: form.data_emissao,
        data_inicio: form.data_inicio || undefined,
        data_fim_previsto: form.data_fim_previsto || undefined,
        riscos_identificados: riscos,
        epis_necessarios: epis,
      };
      if (editId) {
        await serviceOrdersService.update(editId, payload);
        toast.success('OS atualizada com sucesso!');
      } else {
        await serviceOrdersService.create(payload);
        toast.success('OS criada com sucesso!');
      }
      setShowModal(false);
      loadData();
    } catch {
      toast.error('Erro ao salvar OS.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (order: ServiceOrder, newStatus: string) => {
    setUpdatingStatus(order.id);
    try {
      await serviceOrdersService.updateStatus(order.id, newStatus);
      toast.success(`Status atualizado para ${OS_STATUS_LABEL[newStatus]}.`);
      loadData();
    } catch {
      toast.error('Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta Ordem de Serviço?')) return;
    try {
      await serviceOrdersService.delete(id);
      toast.success('OS excluída.');
      loadData();
    } catch {
      toast.error('Erro ao excluir OS.');
    }
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando ordens de serviço"
        description="Buscando ordens, obras, responsáveis e status operacionais."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar ordens de serviço"
        description={loadError}
        action={
          <Button type="button" onClick={loadData}>
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
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">Execução formalizada</span>
              <CardTitle className="text-2xl">Ordens de Serviço (NR-1)</CardTitle>
              <CardDescription>
                Documentação obrigatória de atividades, riscos, responsáveis e execução planejada.
              </CardDescription>
            </div>
          </div>
          <div className="ds-crud-hero__actions">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() => downloadExcel('/service-orders/export/excel', 'ordens-servico.xlsx')}
            >
              Exportar Excel
            </Button>
            <Button
              type="button"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
            >
              Nova OS
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats md:grid-cols-4">
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Total</CardDescription>
            <CardTitle className="ds-crud-stat__value">{total}</CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Ordens disponíveis no recorte filtrado.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--primary">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Ativas</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-action-primary)]">
              {summary.ativo}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Execuções em andamento com OS aberta.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--success">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Concluídas</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-success)]">
              {summary.concluido}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Atividades finalizadas e registradas.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Canceladas</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-text-secondary)]">
              {summary.cancelado}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Ordens encerradas sem execução.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <CardHeader className="ds-crud-filter-header md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de ordens de serviço</CardTitle>
            <CardDescription>
              {total} registro(s) no recorte atual com filtros por status e obra.
            </CardDescription>
          </div>
          <div className="ds-crud-filter-bar grid grid-cols-1 md:w-auto md:grid-cols-2">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className={inputClassName}
          >
            <option value="">Todos os status</option>
            {Object.entries(OS_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterSite}
            onChange={(e) => { setFilterSite(e.target.value); setPage(1); }}
            className={inputClassName}
          >
            <option value="">Todas as obras</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {orders.length === 0 ? (
            <EmptyState
              title="Nenhuma Ordem de Serviço encontrada"
              description="Ainda nao existem ordens de servico registradas para este tenant."
              action={
                <button
                  type="button"
                  onClick={openCreate}
                  className={cn(buttonVariants(), 'inline-flex items-center')}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova OS
                </button>
              }
            />
          ) : (
            <>
              <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data Emissão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
                const allowed = OS_ALLOWED_TRANSITIONS[order.status] ?? [];
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm font-medium">{order.numero}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium text-gray-900">
                      {order.titulo}
                    </TableCell>
                    <TableCell className="text-gray-600">{order.site?.nome ?? '—'}</TableCell>
                    <TableCell className="text-gray-600">{order.responsavel?.nome ?? '—'}</TableCell>
                    <TableCell>
                      {allowed.length > 0 ? (
                        <select
                          value={order.status}
                          disabled={updatingStatus === order.id}
                          onChange={(e) => handleStatusChange(order, e.target.value)}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold cursor-pointer border-0 ${OS_STATUS_COLORS[order.status] ?? ''}`}
                        >
                          <option value={order.status}>{OS_STATUS_LABEL[order.status]}</option>
                          {allowed.map((s) => (
                            <option key={s} value={s}>{OS_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${OS_STATUS_COLORS[order.status] ?? ''}`}>
                          {OS_STATUS_LABEL[order.status] ?? order.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(order.data_emissao).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(order)}
                          className="rounded p-1 text-[var(--ds-color-action-primary)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

              <PaginationControls
                page={page}
                lastPage={lastPage}
                total={total}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? 'Editar OS' : 'Nova Ordem de Serviço'}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto space-y-4 p-6">
              <div>
                <label htmlFor="service-order-titulo" className="mb-1 block text-sm font-semibold text-gray-700">Título *</label>
                <input
                  id="service-order-titulo"
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  aria-label="Título da ordem de serviço"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="service-order-descricao-atividades" className="mb-1 block text-sm font-semibold text-gray-700">Descrição das Atividades *</label>
                <textarea
                  id="service-order-descricao-atividades"
                  value={form.descricao_atividades}
                  onChange={(e) => setForm({ ...form, descricao_atividades: e.target.value })}
                  aria-label="Descrição das atividades da ordem de serviço"
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="service-order-site-id" className="mb-1 block text-sm font-semibold text-gray-700">Obra</label>
                  <select
                    id="service-order-site-id"
                    value={form.site_id}
                    onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                    aria-label="Obra da ordem de serviço"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="service-order-responsavel-id" className="mb-1 block text-sm font-semibold text-gray-700">Responsável</label>
                  <select
                    id="service-order-responsavel-id"
                    value={form.responsavel_id}
                    onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}
                    aria-label="Responsável da ordem de serviço"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="service-order-data-emissao" className="mb-1 block text-sm font-semibold text-gray-700">Data Emissão *</label>
                  <input
                    id="service-order-data-emissao"
                    type="date"
                    value={form.data_emissao}
                    onChange={(e) => setForm({ ...form, data_emissao: e.target.value })}
                    aria-label="Data de emissão"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="service-order-data-inicio" className="mb-1 block text-sm font-semibold text-gray-700">Data Início</label>
                  <input
                    id="service-order-data-inicio"
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    aria-label="Data de início"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="service-order-data-fim-previsto" className="mb-1 block text-sm font-semibold text-gray-700">Fim Previsto</label>
                  <input
                    id="service-order-data-fim-previsto"
                    type="date"
                    value={form.data_fim_previsto}
                    onChange={(e) => setForm({ ...form, data_fim_previsto: e.target.value })}
                    aria-label="Data de fim previsto"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="service-order-responsabilidades" className="mb-1 block text-sm font-semibold text-gray-700">Responsabilidades</label>
                <textarea
                  id="service-order-responsabilidades"
                  value={form.responsabilidades}
                  onChange={(e) => setForm({ ...form, responsabilidades: e.target.value })}
                  aria-label="Responsabilidades da ordem de serviço"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Riscos Identificados (JSON)
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    Ex: [{`{"risco":"Queda","medida_controle":"Cinto"}`}]
                  </span>
                </label>
                <textarea
                  aria-label="Riscos identificados em JSON"
                  value={form.riscos_json}
                  onChange={(e) => setForm({ ...form, riscos_json: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  EPIs Necessários (JSON)
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    Ex: [{`{"nome":"Capacete","ca":"12345"}`}]
                  </span>
                </label>
                <textarea
                  aria-label="EPIs necessários em JSON"
                  value={form.epis_json}
                  onChange={(e) => setForm({ ...form, epis_json: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editId ? 'Salvar' : 'Criar OS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
