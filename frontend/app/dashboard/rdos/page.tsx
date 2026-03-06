'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  rdosService,
  Rdo,
  MaoDeObraItem,
  EquipamentoItem,
  MaterialItem,
  ServicoItem,
  OcorrenciaItem,
  RDO_STATUS_LABEL,
  RDO_STATUS_COLORS,
  RDO_ALLOWED_TRANSITIONS,
  CLIMA_LABEL,
  OCORRENCIA_TIPO_LABEL,
} from '@/services/rdosService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { downloadExcel } from '@/lib/download-excel';
import {
  Plus,
  Search,
  FileSpreadsheet,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  AlertTriangle,
  Users,
  Wrench,
  Package,
  CheckSquare,
  CloudRain,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';

const STEPS = [
  { label: 'Dados Básicos', icon: ClipboardList },
  { label: 'Clima', icon: CloudRain },
  { label: 'Mão de Obra', icon: Users },
  { label: 'Equipamentos', icon: Wrench },
  { label: 'Materiais', icon: Package },
  { label: 'Serviços', icon: CheckSquare },
  { label: 'Ocorrências', icon: AlertTriangle },
];

const CLIMA_OPTIONS = [
  { value: 'ensolarado', label: 'Ensolarado' },
  { value: 'nublado', label: 'Nublado' },
  { value: 'chuvoso', label: 'Chuvoso' },
  { value: 'parcialmente_nublado', label: 'Parcialmente Nublado' },
];

const TURNO_OPTIONS = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
];

const OCORRENCIA_TIPO_OPTIONS = [
  { value: 'acidente', label: 'Acidente' },
  { value: 'incidente', label: 'Incidente' },
  { value: 'visita', label: 'Visita' },
  { value: 'paralisacao', label: 'Paralisação' },
  { value: 'outro', label: 'Outro' },
];

interface FormState {
  data: string;
  site_id: string;
  responsavel_id: string;
  clima_manha: string;
  clima_tarde: string;
  temperatura_min: string;
  temperatura_max: string;
  condicao_terreno: string;
  mao_de_obra: MaoDeObraItem[];
  equipamentos: EquipamentoItem[];
  materiais_recebidos: MaterialItem[];
  servicos_executados: ServicoItem[];
  ocorrencias: OcorrenciaItem[];
  houve_acidente: boolean;
  houve_paralisacao: boolean;
  motivo_paralisacao: string;
  observacoes: string;
  programa_servicos_amanha: string;
}

const defaultForm: FormState = {
  data: new Date().toISOString().slice(0, 10),
  site_id: '',
  responsavel_id: '',
  clima_manha: '',
  clima_tarde: '',
  temperatura_min: '',
  temperatura_max: '',
  condicao_terreno: '',
  mao_de_obra: [],
  equipamentos: [],
  materiais_recebidos: [],
  servicos_executados: [],
  ocorrencias: [],
  houve_acidente: false,
  houve_paralisacao: false,
  motivo_paralisacao: '',
  observacoes: '',
  programa_servicos_amanha: '',
};

export default function RdosPage() {
  const [rdos, setRdos] = useState<Rdo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);

  // Paginação + filtros
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSiteId, setFilterSiteId] = useState('');
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [search, setSearch] = useState('');

  // Resumo
  const [summary, setSummary] = useState({
    total: 0,
    rascunho: 0,
    enviado: 0,
    aprovado: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rdosData, sitesData, usersData] = await Promise.all([
        rdosService.findPaginated({
          page,
          limit,
          status: filterStatus || undefined,
          site_id: filterSiteId || undefined,
          data_inicio: filterDataInicio || undefined,
          data_fim: filterDataFim || undefined,
        }),
        sitesService.findAll(),
        usersService.findAll(),
      ]);
      setRdos(rdosData.data);
      setTotal(rdosData.total);
      setLastPage(rdosData.lastPage);
      setSites(sitesData);
      setUsers(usersData);

      // Calcular resumo a partir dos dados carregados (aproximado)
      const allRdos = rdosData.data;
      setSummary({
        total: rdosData.total,
        rascunho: allRdos.filter((r) => r.status === 'rascunho').length,
        enviado: allRdos.filter((r) => r.status === 'enviado').length,
        aprovado: allRdos.filter((r) => r.status === 'aprovado').length,
      });
    } catch (error) {
      console.error('Erro ao carregar RDOs:', error);
      toast.error('Erro ao carregar RDOs.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterStatus, filterSiteId, filterDataInicio, filterDataFim]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenModal = () => {
    setForm(defaultForm);
    setCurrentStep(0);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.data) {
      toast.error('Informe a data do RDO.');
      return;
    }
    setSaving(true);
    try {
      await rdosService.create({
        data: form.data,
        site_id: form.site_id || undefined,
        responsavel_id: form.responsavel_id || undefined,
        clima_manha: form.clima_manha || undefined,
        clima_tarde: form.clima_tarde || undefined,
        temperatura_min: form.temperatura_min ? Number(form.temperatura_min) : undefined,
        temperatura_max: form.temperatura_max ? Number(form.temperatura_max) : undefined,
        condicao_terreno: form.condicao_terreno || undefined,
        mao_de_obra: form.mao_de_obra.length > 0 ? form.mao_de_obra : undefined,
        equipamentos: form.equipamentos.length > 0 ? form.equipamentos : undefined,
        materiais_recebidos: form.materiais_recebidos.length > 0 ? form.materiais_recebidos : undefined,
        servicos_executados: form.servicos_executados.length > 0 ? form.servicos_executados : undefined,
        ocorrencias: form.ocorrencias.length > 0 ? form.ocorrencias : undefined,
        houve_acidente: form.houve_acidente,
        houve_paralisacao: form.houve_paralisacao,
        motivo_paralisacao: form.motivo_paralisacao || undefined,
        observacoes: form.observacoes || undefined,
        programa_servicos_amanha: form.programa_servicos_amanha || undefined,
      });
      toast.success('RDO criado com sucesso!');
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Erro ao criar RDO:', error);
      toast.error('Erro ao criar RDO.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const updated = await rdosService.updateStatus(id, newStatus);
      setRdos((prev) => prev.map((r) => (r.id === id ? { ...r, status: updated.status } : r)));
      toast.success(`Status atualizado para "${RDO_STATUS_LABEL[newStatus]}"`);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status do RDO.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este RDO?')) return;
    try {
      await rdosService.delete(id);
      toast.success('RDO excluído.');
      loadData();
    } catch (error) {
      console.error('Erro ao excluir RDO:', error);
      toast.error('Erro ao excluir RDO.');
    }
  };

  // Helpers para arrays do formulário
  const addMaoDeObra = () =>
    setForm((f) => ({
      ...f,
      mao_de_obra: [...f.mao_de_obra, { funcao: '', quantidade: 1, turno: 'manha', horas: 8 }],
    }));
  const removeMaoDeObra = (i: number) =>
    setForm((f) => ({ ...f, mao_de_obra: f.mao_de_obra.filter((_, idx) => idx !== i) }));
  const updateMaoDeObra = (i: number, field: keyof MaoDeObraItem, value: string | number) =>
    setForm((f) => {
      const arr = [...f.mao_de_obra];
      arr[i] = { ...arr[i], [field]: value } as MaoDeObraItem;
      return { ...f, mao_de_obra: arr };
    });

  const addEquipamento = () =>
    setForm((f) => ({
      ...f,
      equipamentos: [...f.equipamentos, { nome: '', quantidade: 1, horas_trabalhadas: 0, horas_ociosas: 0 }],
    }));
  const removeEquipamento = (i: number) =>
    setForm((f) => ({ ...f, equipamentos: f.equipamentos.filter((_, idx) => idx !== i) }));
  const updateEquipamento = (i: number, field: keyof EquipamentoItem, value: string | number) =>
    setForm((f) => {
      const arr = [...f.equipamentos];
      arr[i] = { ...arr[i], [field]: value } as EquipamentoItem;
      return { ...f, equipamentos: arr };
    });

  const addMaterial = () =>
    setForm((f) => ({
      ...f,
      materiais_recebidos: [...f.materiais_recebidos, { descricao: '', unidade: 'un', quantidade: 0 }],
    }));
  const removeMaterial = (i: number) =>
    setForm((f) => ({ ...f, materiais_recebidos: f.materiais_recebidos.filter((_, idx) => idx !== i) }));
  const updateMaterial = (i: number, field: keyof MaterialItem, value: string | number) =>
    setForm((f) => {
      const arr = [...f.materiais_recebidos];
      arr[i] = { ...arr[i], [field]: value } as MaterialItem;
      return { ...f, materiais_recebidos: arr };
    });

  const addServico = () =>
    setForm((f) => ({
      ...f,
      servicos_executados: [...f.servicos_executados, { descricao: '', percentual_concluido: 0 }],
    }));
  const removeServico = (i: number) =>
    setForm((f) => ({ ...f, servicos_executados: f.servicos_executados.filter((_, idx) => idx !== i) }));
  const updateServico = (i: number, field: keyof ServicoItem, value: string | number) =>
    setForm((f) => {
      const arr = [...f.servicos_executados];
      arr[i] = { ...arr[i], [field]: value } as ServicoItem;
      return { ...f, servicos_executados: arr };
    });

  const addOcorrencia = () =>
    setForm((f) => ({
      ...f,
      ocorrencias: [...f.ocorrencias, { tipo: 'outro', descricao: '' }],
    }));
  const removeOcorrencia = (i: number) =>
    setForm((f) => ({ ...f, ocorrencias: f.ocorrencias.filter((_, idx) => idx !== i) }));
  const updateOcorrencia = (i: number, field: keyof OcorrenciaItem, value: string) =>
    setForm((f) => {
      const arr = [...f.ocorrencias];
      arr[i] = { ...arr[i], [field]: value } as OcorrenciaItem;
      return { ...f, ocorrencias: arr };
    });

  const filteredRdos = search
    ? rdos.filter(
        (r) =>
          r.numero.toLowerCase().includes(search.toLowerCase()) ||
          r.site?.nome?.toLowerCase().includes(search.toLowerCase()),
      )
    : rdos;

  const totalTrabalhadores = (rdo: Rdo) =>
    (rdo.mao_de_obra ?? []).reduce((sum, m) => sum + (m.quantidade ?? 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Relatórios Diários de Obras (RDO)</h1>
          <p className="mt-1 text-sm text-gray-500">
            Registro diário de atividades, mão de obra e ocorrências no canteiro
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadExcel('/rdos/export/excel', 'rdos.xlsx')}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </button>
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo RDO
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total de RDOs', value: summary.total, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Rascunhos', value: summary.rascunho, color: 'text-gray-600', bg: 'bg-gray-50' },
          { label: 'Enviados', value: summary.enviado, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Aprovados', value: summary.aprovado, color: 'text-green-600', bg: 'bg-green-50' },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border border-gray-100 ${card.bg} p-4`}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar número ou obra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="enviado">Enviado</option>
          <option value="aprovado">Aprovado</option>
        </select>
        <select
          value={filterSiteId}
          onChange={(e) => { setFilterSiteId(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Todas as obras</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.nome}</option>
          ))}
        </select>
        <input
          type="date"
          value={filterDataInicio}
          onChange={(e) => { setFilterDataInicio(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
          title="Data início"
        />
        <input
          type="date"
          value={filterDataFim}
          onChange={(e) => { setFilterDataFim(e.target.value); setPage(1); }}
          className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
          title="Data fim"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#F8FAFC]">
              <TableHead>Número</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Obra/Setor</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trabalhadores</TableHead>
              <TableHead>Acidente</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-gray-400">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredRdos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-gray-400">
                  Nenhum RDO encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredRdos.map((rdo) => (
                <TableRow key={rdo.id} className="group transition-colors hover:bg-[#EEF2FF]">
                  <TableCell className="font-mono text-sm font-medium text-blue-700">
                    {rdo.numero}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(rdo.data).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-sm">{rdo.site?.nome ?? '—'}</TableCell>
                  <TableCell className="text-sm">{rdo.responsavel?.nome ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RDO_STATUS_COLORS[rdo.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {RDO_STATUS_LABEL[rdo.status] ?? rdo.status}
                      </span>
                      {RDO_ALLOWED_TRANSITIONS[rdo.status]?.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) handleStatusChange(rdo.id, e.target.value);
                          }}
                          className="rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-600"
                        >
                          <option value="">Mover para...</option>
                          {RDO_ALLOWED_TRANSITIONS[rdo.status].map((s) => (
                            <option key={s} value={s}>{RDO_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {totalTrabalhadores(rdo) > 0 ? (
                      <span className="font-medium">{totalTrabalhadores(rdo)}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {rdo.houve_acidente ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3 w-3" /> Sim
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Não</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleDelete(rdo.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t border-gray-100 px-4 py-3">
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        </div>
      </div>

      {/* Modal de criação — multi-step */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            {/* Header do modal */}
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-semibold text-[#0F172A]">Novo Relatório Diário de Obra</h2>
              {/* Steps indicator */}
              <div className="mt-3 flex items-center gap-1">
                {STEPS.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentStep(idx)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        idx === currentStep
                          ? 'bg-[#2563EB] text-white'
                          : idx < currentStep
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                      title={step.label}
                    >
                      {idx + 1}
                    </button>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-4 ${idx < currentStep ? 'bg-blue-300' : 'bg-gray-200'}`}
                      />
                    )}
                  </div>
                ))}
                <span className="ml-3 text-xs text-gray-500">{STEPS[currentStep].label}</span>
              </div>
            </div>

            {/* Conteúdo do step */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              {/* Step 0: Dados Básicos */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Data *</label>
                    <input
                      type="date"
                      value={form.data}
                      onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Obra/Setor</label>
                    <select
                      value={form.site_id}
                      onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Selecionar obra...</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Responsável</label>
                    <select
                      value={form.responsavel_id}
                      onChange={(e) => setForm((f) => ({ ...f, responsavel_id: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Selecionar responsável...</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Step 1: Clima */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Clima manhã</label>
                      <select
                        value={form.clima_manha}
                        onChange={(e) => setForm((f) => ({ ...f, clima_manha: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Clima tarde</label>
                      <select
                        value={form.clima_tarde}
                        onChange={(e) => setForm((f) => ({ ...f, clima_tarde: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Temp. mín (°C)</label>
                      <input
                        type="number"
                        value={form.temperatura_min}
                        onChange={(e) => setForm((f) => ({ ...f, temperatura_min: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Temp. máx (°C)</label>
                      <input
                        type="number"
                        value={form.temperatura_max}
                        onChange={(e) => setForm((f) => ({ ...f, temperatura_max: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Condição do terreno</label>
                    <input
                      type="text"
                      value={form.condicao_terreno}
                      onChange={(e) => setForm((f) => ({ ...f, condicao_terreno: e.target.value }))}
                      placeholder="Ex: seco, molhado, enlameado..."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Mão de Obra */}
              {currentStep === 2 && (
                <div className="space-y-3">
                  {form.mao_de_obra.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-gray-100 p-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Função</label>
                        <input
                          type="text"
                          value={item.funcao}
                          onChange={(e) => updateMaoDeObra(i, 'funcao', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder="Ex: Pedreiro"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Qtd</label>
                        <input
                          type="number"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) => updateMaoDeObra(i, 'quantidade', Number(e.target.value))}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Turno</label>
                        <select
                          value={item.turno}
                          onChange={(e) => updateMaoDeObra(i, 'turno', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        >
                          {TURNO_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Horas</label>
                          <input
                            type="number"
                            value={item.horas}
                            min={0}
                            max={24}
                            onChange={(e) => updateMaoDeObra(i, 'horas', Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button onClick={() => removeMaoDeObra(i)} className="mb-0.5 rounded p-1 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addMaoDeObra} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar função
                  </button>
                </div>
              )}

              {/* Step 3: Equipamentos */}
              {currentStep === 3 && (
                <div className="space-y-3">
                  {form.equipamentos.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-gray-100 p-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Equipamento</label>
                        <input
                          type="text"
                          value={item.nome}
                          onChange={(e) => updateEquipamento(i, 'nome', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder="Ex: Betoneira"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Qtd</label>
                        <input
                          type="number"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) => updateEquipamento(i, 'quantidade', Number(e.target.value))}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600">H. trabalhadas</label>
                          <input
                            type="number"
                            value={item.horas_trabalhadas}
                            min={0}
                            onChange={(e) => updateEquipamento(i, 'horas_trabalhadas', Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button onClick={() => removeEquipamento(i)} className="mb-0.5 rounded p-1 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addEquipamento} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar equipamento
                  </button>
                </div>
              )}

              {/* Step 4: Materiais */}
              {currentStep === 4 && (
                <div className="space-y-3">
                  {form.materiais_recebidos.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-gray-100 p-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Descrição</label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) => updateMaterial(i, 'descricao', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder="Ex: Cimento CP-II"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Unidade</label>
                        <input
                          type="text"
                          value={item.unidade}
                          onChange={(e) => updateMaterial(i, 'unidade', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder="sc, m³, kg"
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Quantidade</label>
                          <input
                            type="number"
                            value={item.quantidade}
                            min={0}
                            onChange={(e) => updateMaterial(i, 'quantidade', Number(e.target.value))}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button onClick={() => removeMaterial(i)} className="mb-0.5 rounded p-1 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addMaterial} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar material
                  </button>
                </div>
              )}

              {/* Step 5: Serviços Executados */}
              {currentStep === 5 && (
                <div className="space-y-3">
                  {form.servicos_executados.map((item, i) => (
                    <div key={i} className="grid grid-cols-5 items-end gap-2 rounded-xl border border-gray-100 p-3">
                      <div className="col-span-3">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Descrição do serviço</label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) => updateServico(i, 'descricao', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          placeholder="Ex: Concretagem de laje"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">% Concluído</label>
                        <input
                          type="number"
                          value={item.percentual_concluido}
                          min={0}
                          max={100}
                          onChange={(e) => updateServico(i, 'percentual_concluido', Number(e.target.value))}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-end">
                        <button onClick={() => removeServico(i)} className="mb-0.5 rounded p-1 text-red-400 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addServico} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar serviço
                  </button>
                </div>
              )}

              {/* Step 6: Ocorrências + Observações */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.houve_acidente}
                        onChange={(e) => setForm((f) => ({ ...f, houve_acidente: e.target.checked }))}
                        className="h-4 w-4 rounded"
                      />
                      <span className="font-medium text-red-600">Houve acidente</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.houve_paralisacao}
                        onChange={(e) => setForm((f) => ({ ...f, houve_paralisacao: e.target.checked }))}
                        className="h-4 w-4 rounded"
                      />
                      <span className="font-medium text-amber-600">Houve paralisação</span>
                    </label>
                  </div>
                  {form.houve_paralisacao && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Motivo da paralisação</label>
                      <input
                        type="text"
                        value={form.motivo_paralisacao}
                        onChange={(e) => setForm((f) => ({ ...f, motivo_paralisacao: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Ocorrências</p>
                    {form.ocorrencias.map((item, i) => (
                      <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-gray-100 p-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
                          <select
                            value={item.tipo}
                            onChange={(e) => updateOcorrencia(i, 'tipo', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          >
                            {OCORRENCIA_TIPO_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Descrição</label>
                          <input
                            type="text"
                            value={item.descricao}
                            onChange={(e) => updateOcorrencia(i, 'descricao', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-gray-600">Hora</label>
                            <input
                              type="time"
                              value={item.hora ?? ''}
                              onChange={(e) => updateOcorrencia(i, 'hora', e.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                            />
                          </div>
                          <button onClick={() => removeOcorrencia(i)} className="mb-0.5 rounded p-1 text-red-400 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={addOcorrencia} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                      <Plus className="h-4 w-4" /> Adicionar ocorrência
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Observações gerais</label>
                    <textarea
                      value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Observações relevantes do dia..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Programa para amanhã</label>
                    <textarea
                      value={form.programa_servicos_amanha}
                      onChange={(e) => setForm((f) => ({ ...f, programa_servicos_amanha: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Serviços planejados para o próximo dia..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer do modal */}
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                )}
                {currentStep < STEPS.length - 1 ? (
                  <button
                    onClick={() => setCurrentStep((s) => s + 1)}
                    className="flex items-center gap-1 rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-[#2563EB] px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Criar RDO'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
