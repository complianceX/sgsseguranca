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
      const paged = await serviceOrdersService.findPaginated({
        page,
        limit,
        status: filterStatus || undefined,
        site_id: filterSite || undefined,
      });
      setOrders(paged.data);
      setTotal(paged.total);
      setLastPage(paged.lastPage);
    } catch {
      toast.error('Erro ao carregar Ordens de Serviço.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterStatus, filterSite]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    usersService.findAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as { data: User[] }).data ?? [];
      setUsers(list);
    }).catch(() => {});
    sitesService.findAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as { data: Site[] }).data ?? [];
      setSites(list);
    }).catch(() => {});
  }, []);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <ClipboardList className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ordens de Serviço (NR-1)</h1>
              <p className="text-sm text-gray-500">Documentação obrigatória de atividades e riscos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => downloadExcel('/service-orders/export/excel', 'ordens-servico.xlsx')}
              className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-green-600" />
              Exportar Excel
            </button>
            <button
              onClick={openCreate}
              className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova OS
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{total}</p>
        </div>
        <div className="rounded-xl border bg-blue-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-blue-600 uppercase">Ativas</p>
          <p className="mt-1 text-3xl font-bold text-blue-700">{summary.ativo}</p>
        </div>
        <div className="rounded-xl border bg-green-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-green-600 uppercase">Concluídas</p>
          <p className="mt-1 text-3xl font-bold text-green-700">{summary.concluido}</p>
        </div>
        <div className="rounded-xl border bg-gray-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Canceladas</p>
          <p className="mt-1 text-3xl font-bold text-gray-600">{summary.cancelado}</p>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50/70 p-4">
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos os status</option>
            {Object.entries(OS_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterSite}
            onChange={(e) => { setFilterSite(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todas as obras</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

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
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                  </div>
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                  Nenhuma Ordem de Serviço encontrada.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
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
                          className="text-blue-600 hover:text-blue-800"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {!loading && (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        )}
      </div>

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
                <label className="mb-1 block text-sm font-semibold text-gray-700">Título *</label>
                <input
                  type="text"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Descrição das Atividades *</label>
                <textarea
                  value={form.descricao_atividades}
                  onChange={(e) => setForm({ ...form, descricao_atividades: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Obra</label>
                  <select
                    value={form.site_id}
                    onChange={(e) => setForm({ ...form, site_id: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Responsável</label>
                  <select
                    value={form.responsavel_id}
                    onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Data Emissão *</label>
                  <input
                    type="date"
                    value={form.data_emissao}
                    onChange={(e) => setForm({ ...form, data_emissao: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Data Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Fim Previsto</label>
                  <input
                    type="date"
                    value={form.data_fim_previsto}
                    onChange={(e) => setForm({ ...form, data_fim_previsto: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Responsabilidades</label>
                <textarea
                  value={form.responsabilidades}
                  onChange={(e) => setForm({ ...form, responsabilidades: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
                  value={form.riscos_json}
                  onChange={(e) => setForm({ ...form, riscos_json: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
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
                  value={form.epis_json}
                  onChange={(e) => setForm({ ...form, epis_json: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
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
                className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
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
