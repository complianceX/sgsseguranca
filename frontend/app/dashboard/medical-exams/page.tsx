'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  medicalExamsService,
  MedicalExam,
  MedicalExamExpirySummary,
  TIPO_EXAME_LABEL,
  RESULTADO_LABEL,
  RESULTADO_COLORS,
} from '@/services/medicalExamsService';
import { usersService } from '@/services/usersService';
import { downloadExcel } from '@/lib/download-excel';
import {
  Plus,
  FileSpreadsheet,
  Stethoscope,
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

type FormState = {
  user_id: string;
  tipo_exame: string;
  resultado: string;
  data_realizacao: string;
  data_vencimento: string;
  medico_responsavel: string;
  crm_medico: string;
  observacoes: string;
};

const INITIAL_FORM: FormState = {
  user_id: '',
  tipo_exame: 'periodico',
  resultado: 'apto',
  data_realizacao: '',
  data_vencimento: '',
  medico_responsavel: '',
  crm_medico: '',
  observacoes: '',
};

function getVencimentoStatus(data_vencimento: string | null) {
  if (!data_vencimento) return { label: 'Sem vencimento', color: 'text-gray-500 bg-gray-50' };
  const now = new Date();
  const venc = new Date(data_vencimento);
  const diff = (venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { label: 'Vencido', color: 'text-red-700 bg-red-50' };
  if (diff <= 30) return { label: 'Vence em breve', color: 'text-amber-700 bg-amber-50' };
  return { label: 'Em dia', color: 'text-green-700 bg-green-50' };
}

export default function MedicalExamsPage() {
  const [exams, setExams] = useState<MedicalExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [summary, setSummary] = useState<MedicalExamExpirySummary>({
    total: 0,
    expired: 0,
    expiringSoon: 0,
    valid: 0,
  });
  const [filterTipo, setFilterTipo] = useState('');
  const [filterResultado, setFilterResultado] = useState('');
  const [users, setUsers] = useState<User[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [paged, sum] = await Promise.all([
        medicalExamsService.findPaginated({
          page,
          limit,
          tipo_exame: filterTipo || undefined,
          resultado: filterResultado || undefined,
        }),
        medicalExamsService.getExpirySummary(),
      ]);
      setExams(paged.data);
      setTotal(paged.total);
      setLastPage(paged.lastPage);
      setSummary(sum);
    } catch {
      toast.error('Erro ao carregar exames médicos.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterTipo, filterResultado]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    usersService.findAll().then((res) => {
      const list = Array.isArray(res) ? res : (res as { data: User[] }).data ?? [];
      setUsers(list);
    }).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  };

  const openEdit = (exam: MedicalExam) => {
    setEditId(exam.id);
    setForm({
      user_id: exam.user_id,
      tipo_exame: exam.tipo_exame,
      resultado: exam.resultado,
      data_realizacao: exam.data_realizacao?.slice(0, 10) ?? '',
      data_vencimento: exam.data_vencimento?.slice(0, 10) ?? '',
      medico_responsavel: exam.medico_responsavel ?? '',
      crm_medico: exam.crm_medico ?? '',
      observacoes: exam.observacoes ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.user_id || !form.data_realizacao) {
      toast.error('Funcionário e data de realização são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        data_vencimento: form.data_vencimento || undefined,
        medico_responsavel: form.medico_responsavel || undefined,
        crm_medico: form.crm_medico || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (editId) {
        await medicalExamsService.update(editId, payload);
        toast.success('Exame atualizado com sucesso!');
      } else {
        await medicalExamsService.create(payload);
        toast.success('Exame registrado com sucesso!');
      }
      setShowModal(false);
      loadData();
    } catch {
      toast.error('Erro ao salvar exame.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este exame médico?')) return;
    try {
      await medicalExamsService.delete(id);
      toast.success('Exame excluído.');
      loadData();
    } catch {
      toast.error('Erro ao excluir exame.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
              <Stethoscope className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Exames Médicos (PCMSO)</h1>
              <p className="text-sm text-gray-500">Controle de ASOs conforme NR-7</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => downloadExcel('/medical-exams/export/excel', 'exames-medicos.xlsx')}
              className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-green-600" />
              Exportar Excel
            </button>
            <button
              onClick={openCreate}
              className="flex items-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar Exame
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{summary.total}</p>
        </div>
        <div className="rounded-xl border bg-red-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-red-600 uppercase">Vencidos</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{summary.expired}</p>
        </div>
        <div className="rounded-xl border bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-amber-600 uppercase">Vencendo (30d)</p>
          <p className="mt-1 text-3xl font-bold text-amber-700">{summary.expiringSoon}</p>
        </div>
        <div className="rounded-xl border bg-green-50 p-4 shadow-sm">
          <p className="text-xs font-medium text-green-600 uppercase">Em dia</p>
          <p className="mt-1 text-3xl font-bold text-green-700">{summary.valid}</p>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50/70 p-4">
          <select
            value={filterTipo}
            onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_EXAME_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterResultado}
            onChange={(e) => { setFilterResultado(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="">Todos os resultados</option>
            {Object.entries(RESULTADO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Data Realização</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Médico</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  </div>
                </TableCell>
              </TableRow>
            ) : exams.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                  Nenhum exame médico encontrado.
                </TableCell>
              </TableRow>
            ) : (
              exams.map((exam) => {
                const vencStatus = getVencimentoStatus(exam.data_vencimento);
                return (
                  <TableRow key={exam.id}>
                    <TableCell className="font-medium text-gray-900">
                      {exam.user?.nome ?? '—'}
                    </TableCell>
                    <TableCell>{TIPO_EXAME_LABEL[exam.tipo_exame] ?? exam.tipo_exame}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${RESULTADO_COLORS[exam.resultado] ?? ''}`}>
                        {RESULTADO_LABEL[exam.resultado] ?? exam.resultado}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(exam.data_realizacao).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      {exam.data_vencimento ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${vencStatus.color}`}>
                          {new Date(exam.data_vencimento).toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-600">{exam.medico_responsavel ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(exam)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exam.id)}
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
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editId ? 'Editar Exame Médico' : 'Registrar Exame Médico'}
              </h2>
              <button onClick={() => setShowModal(false)}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Funcionário *</label>
                <select
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Tipo de Exame *</label>
                  <select
                    value={form.tipo_exame}
                    onChange={(e) => setForm({ ...form, tipo_exame: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {Object.entries(TIPO_EXAME_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Resultado *</label>
                  <select
                    value={form.resultado}
                    onChange={(e) => setForm({ ...form, resultado: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  >
                    {Object.entries(RESULTADO_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Data de Realização *</label>
                  <input
                    type="date"
                    value={form.data_realizacao}
                    onChange={(e) => setForm({ ...form, data_realizacao: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Data de Vencimento</label>
                  <input
                    type="date"
                    value={form.data_vencimento}
                    onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Médico Responsável</label>
                  <input
                    type="text"
                    value={form.medico_responsavel}
                    onChange={(e) => setForm({ ...form, medico_responsavel: e.target.value })}
                    placeholder="Dr. Nome"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">CRM</label>
                  <input
                    type="text"
                    value={form.crm_medico}
                    onChange={(e) => setForm({ ...form, crm_medico: e.target.value })}
                    placeholder="CRM/SP 123456"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
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
                className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editId ? 'Salvar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
