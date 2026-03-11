'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
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
  AlertTriangle,
  Users,
  Wrench,
  Package,
  CheckSquare,
  CloudRain,
  Eye,
  Pencil,
  X,
  Sun,
  Thermometer,
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
  'h-10 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

const formInputClassName =
  'w-full rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)] transition-all';

const formInputSmClassName =
  'w-full rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-2 py-1.5 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none transition-all';

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

function rdoToForm(rdo: Rdo): FormState {
  return {
    data: typeof rdo.data === 'string' ? rdo.data.slice(0, 10) : new Date(rdo.data).toISOString().slice(0, 10),
    site_id: rdo.site_id ?? '',
    responsavel_id: rdo.responsavel_id ?? '',
    clima_manha: rdo.clima_manha ?? '',
    clima_tarde: rdo.clima_tarde ?? '',
    temperatura_min: rdo.temperatura_min != null ? String(rdo.temperatura_min) : '',
    temperatura_max: rdo.temperatura_max != null ? String(rdo.temperatura_max) : '',
    condicao_terreno: rdo.condicao_terreno ?? '',
    mao_de_obra: rdo.mao_de_obra ?? [],
    equipamentos: rdo.equipamentos ?? [],
    materiais_recebidos: rdo.materiais_recebidos ?? [],
    servicos_executados: rdo.servicos_executados ?? [],
    ocorrencias: rdo.ocorrencias ?? [],
    houve_acidente: rdo.houve_acidente,
    houve_paralisacao: rdo.houve_paralisacao,
    motivo_paralisacao: rdo.motivo_paralisacao ?? '',
    observacoes: rdo.observacoes ?? '',
    programa_servicos_amanha: rdo.programa_servicos_amanha ?? '',
  };
}

export default function RdosPage() {
  const [rdos, setRdos] = useState<Rdo[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);

  // View modal
  const [viewRdo, setViewRdo] = useState<Rdo | null>(null);

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
  const deferredSearch = useDeferredValue(search);

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
      setLoadError(null);
      const [rdosData, sitesPage, usersPage] = await Promise.all([
        rdosService.findPaginated({
          page,
          limit,
          status: filterStatus || undefined,
          site_id: filterSiteId || undefined,
          data_inicio: filterDataInicio || undefined,
          data_fim: filterDataFim || undefined,
        }),
        sitesService.findPaginated({ page: 1, limit: 100 }),
        usersService.findPaginated({ page: 1, limit: 100 }),
      ]);
      setRdos(rdosData.data);
      setTotal(rdosData.total);
      setLastPage(rdosData.lastPage);
      setSites(sitesPage.data);
      setUsers(usersPage.data);

      const allRdos = rdosData.data;
      setSummary({
        total: rdosData.total,
        rascunho: allRdos.filter((r) => r.status === 'rascunho').length,
        enviado: allRdos.filter((r) => r.status === 'enviado').length,
        aprovado: allRdos.filter((r) => r.status === 'aprovado').length,
      });
    } catch (error) {
      console.error('Erro ao carregar RDOs:', error);
      setLoadError('Não foi possível carregar os RDOs.');
      toast.error('Erro ao carregar RDOs.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterStatus, filterSiteId, filterDataInicio, filterDataFim]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setCurrentStep(0);
    setShowModal(true);
  };

  const handleOpenEdit = (rdo: Rdo) => {
    setEditingId(rdo.id);
    setForm(rdoToForm(rdo));
    setCurrentStep(0);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.data) {
      toast.error('Informe a data do RDO.');
      return;
    }
    setSaving(true);
    const payload = {
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
    };
    try {
      if (editingId) {
        await rdosService.update(editingId, payload);
        toast.success('RDO atualizado com sucesso!');
      } else {
        await rdosService.create(payload);
        toast.success('RDO criado com sucesso!');
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Erro ao salvar RDO:', error);
      toast.error('Erro ao salvar RDO.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const updated = await rdosService.updateStatus(id, newStatus);
      setRdos((prev) => prev.map((r) => (r.id === id ? { ...r, status: updated.status } : r)));
      if (viewRdo?.id === id) setViewRdo((v) => v ? { ...v, status: updated.status } : v);
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

  const filteredRdos = deferredSearch
    ? rdos.filter(
        (r) =>
          r.numero.toLowerCase().includes(deferredSearch.toLowerCase()) ||
          r.site?.nome?.toLowerCase().includes(deferredSearch.toLowerCase()),
      )
    : rdos;

  const totalTrabalhadores = (rdo: Rdo) =>
    (rdo.mao_de_obra ?? []).reduce((sum, m) => sum + (m.quantidade ?? 0), 0);

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando RDOs"
        description="Buscando relatórios, filtros, obras e responsáveis."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar RDOs"
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
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Relatórios Diários de Obras</CardTitle>
              <CardDescription>
                Controle produção diária, clima, mão de obra, ocorrências e status do canteiro.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              leftIcon={<FileSpreadsheet className="h-4 w-4" />}
              onClick={() => downloadExcel('/rdos/export/excel', 'rdos.xlsx')}
            >
              Exportar Excel
            </Button>
            <Button type="button" leftIcon={<Plus className="h-4 w-4" />} onClick={handleOpenCreate}>
              Novo RDO
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total de RDOs</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Rascunhos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-text-secondary)]">{summary.rascunho}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Enviados</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">{summary.enviado}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Aprovados</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">{summary.aprovado}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {summary.rascunho > 0 ? (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/10"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--ds-color-warning)]" />
              <CardTitle className="text-base">Há RDOs pendentes de envio</CardTitle>
            </div>
            <CardDescription>
              {summary.rascunho} relatório(s) ainda estão em rascunho. Feche o ciclo diário e encaminhe para aprovação.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
          <div className="space-y-1">
            <CardTitle>Base de RDOs</CardTitle>
            <CardDescription>
              {total} registro(s) no recorte atual com filtros por status, obra e período.
            </CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar número ou obra..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(inputClassName, 'w-full pl-9')}
              />
            </div>
            <select
              aria-label="Filtrar por status"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className={cn(inputClassName, 'w-full')}
            >
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="enviado">Enviado</option>
              <option value="aprovado">Aprovado</option>
            </select>
            <select
              aria-label="Filtrar por obra"
              value={filterSiteId}
              onChange={(e) => { setFilterSiteId(e.target.value); setPage(1); }}
              className={cn(inputClassName, 'w-full')}
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
              className={cn(inputClassName, 'w-full')}
              title="Data início"
            />
            <input
              type="date"
              value={filterDataFim}
              onChange={(e) => { setFilterDataFim(e.target.value); setPage(1); }}
              className={cn(inputClassName, 'w-full')}
              title="Data fim"
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredRdos.length === 0 ? (
            <EmptyState
              title="Nenhum RDO encontrado"
              description={
                deferredSearch
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda não existem RDOs registrados para este tenant.'
              }
              action={
                !deferredSearch ? (
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo RDO
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
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
                  {filteredRdos.map((rdo) => (
                    <TableRow key={rdo.id}>
                      <TableCell className="font-mono text-sm font-medium text-[var(--ds-color-action-primary)]">
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
                              aria-label="Mover status do RDO"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) handleStatusChange(rdo.id, e.target.value);
                              }}
                              className="rounded border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-1 py-0.5 text-xs text-[var(--ds-color-text-secondary)]"
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
                          <span className="text-[var(--ds-color-text-muted)]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {rdo.houve_acidente ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-color-danger)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ds-color-danger)]">
                            <AlertTriangle className="h-3 w-3" /> Sim
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--ds-color-text-muted)]">Não</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewRdo(rdo)}
                            className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(rdo)}
                            className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-action-primary)]/10 hover:text-[var(--ds-color-action-primary)]"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rdo.id)}
                            className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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

      {/* ── Modal de criação/edição ────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-6 py-4">
              <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                {editingId ? 'Editar RDO' : 'Novo Relatório Diário de Obra'}
              </h2>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Steps indicator */}
            <div className="border-b border-[var(--ds-color-border-subtle)] px-6 py-3">
              <div className="flex items-center gap-1">
                {STEPS.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(idx)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        idx === currentStep
                          ? 'bg-[var(--ds-color-action-primary)] text-white'
                          : idx < currentStep
                          ? 'bg-[color:var(--ds-color-action-primary)]/15 text-[var(--ds-color-action-primary)]'
                          : 'bg-[color:var(--ds-color-surface-muted)] text-[var(--ds-color-text-muted)]'
                      }`}
                      title={step.label}
                    >
                      {idx + 1}
                    </button>
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`h-0.5 w-4 transition-colors ${
                          idx < currentStep
                            ? 'bg-[var(--ds-color-action-primary)]'
                            : 'bg-[var(--ds-color-border-subtle)]'
                        }`}
                      />
                    )}
                  </div>
                ))}
                <span className="ml-3 text-xs text-[var(--ds-color-text-muted)]">{STEPS[currentStep].label}</span>
              </div>
            </div>

            {/* Conteúdo do step */}
            <div className="max-h-[55vh] overflow-y-auto px-6 py-5 space-y-4">

              {/* Step 0: Dados Básicos */}
              {currentStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="rdo-data" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Data *</label>
                    <input
                      id="rdo-data"
                      type="date"
                      value={form.data}
                      onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                      className={formInputClassName}
                    />
                  </div>
                  <div>
                    <label htmlFor="rdo-site-id" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Obra/Setor</label>
                    <select
                      id="rdo-site-id"
                      value={form.site_id}
                      onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
                      className={formInputClassName}
                    >
                      <option value="">Selecionar obra...</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="rdo-responsavel-id" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Responsável</label>
                    <select
                      id="rdo-responsavel-id"
                      value={form.responsavel_id}
                      onChange={(e) => setForm((f) => ({ ...f, responsavel_id: e.target.value }))}
                      className={formInputClassName}
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
                      <label htmlFor="rdo-clima-manha" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Clima manhã</label>
                      <select
                        id="rdo-clima-manha"
                        value={form.clima_manha}
                        onChange={(e) => setForm((f) => ({ ...f, clima_manha: e.target.value }))}
                        className={formInputClassName}
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="rdo-clima-tarde" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Clima tarde</label>
                      <select
                        id="rdo-clima-tarde"
                        value={form.clima_tarde}
                        onChange={(e) => setForm((f) => ({ ...f, clima_tarde: e.target.value }))}
                        className={formInputClassName}
                      >
                        <option value="">Selecionar...</option>
                        {CLIMA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="rdo-temperatura-min" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Temp. mín (°C)</label>
                      <input
                        id="rdo-temperatura-min"
                        type="number"
                        value={form.temperatura_min}
                        onChange={(e) => setForm((f) => ({ ...f, temperatura_min: e.target.value }))}
                        className={formInputClassName}
                      />
                    </div>
                    <div>
                      <label htmlFor="rdo-temperatura-max" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Temp. máx (°C)</label>
                      <input
                        id="rdo-temperatura-max"
                        type="number"
                        value={form.temperatura_max}
                        onChange={(e) => setForm((f) => ({ ...f, temperatura_max: e.target.value }))}
                        className={formInputClassName}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="rdo-condicao-terreno" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Condição do terreno</label>
                    <input
                      id="rdo-condicao-terreno"
                      type="text"
                      value={form.condicao_terreno}
                      onChange={(e) => setForm((f) => ({ ...f, condicao_terreno: e.target.value }))}
                      placeholder="Ex: seco, molhado, enlameado..."
                      className={formInputClassName}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Mão de Obra */}
              {currentStep === 2 && (
                <div className="space-y-3">
                  {form.mao_de_obra.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Função</label>
                        <input
                          type="text"
                          value={item.funcao}
                          onChange={(e) => updateMaoDeObra(i, 'funcao', e.target.value)}
                          className={formInputSmClassName}
                          placeholder="Ex: Pedreiro"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Qtd</label>
                        <input
                          type="number"
                          aria-label="Quantidade de trabalhadores"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) => updateMaoDeObra(i, 'quantidade', Number(e.target.value))}
                          className={formInputSmClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Turno</label>
                        <select
                          aria-label="Turno de trabalho"
                          value={item.turno}
                          onChange={(e) => updateMaoDeObra(i, 'turno', e.target.value)}
                          className={formInputSmClassName}
                        >
                          {TURNO_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Horas</label>
                          <input
                            type="number"
                            aria-label="Horas trabalhadas"
                            value={item.horas}
                            min={0}
                            max={24}
                            onChange={(e) => updateMaoDeObra(i, 'horas', Number(e.target.value))}
                            className={formInputSmClassName}
                          />
                        </div>
                        <button type="button" title="Remover" onClick={() => removeMaoDeObra(i)} className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addMaoDeObra} className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar função
                  </button>
                </div>
              )}

              {/* Step 3: Equipamentos */}
              {currentStep === 3 && (
                <div className="space-y-3">
                  {form.equipamentos.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Equipamento</label>
                        <input
                          type="text"
                          value={item.nome}
                          onChange={(e) => updateEquipamento(i, 'nome', e.target.value)}
                          className={formInputSmClassName}
                          placeholder="Ex: Betoneira"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Qtd</label>
                        <input
                          type="number"
                          aria-label="Quantidade de equipamentos"
                          value={item.quantidade}
                          min={1}
                          onChange={(e) => updateEquipamento(i, 'quantidade', Number(e.target.value))}
                          className={formInputSmClassName}
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">H. trabalhadas</label>
                          <input
                            type="number"
                            aria-label="Horas trabalhadas pelo equipamento"
                            value={item.horas_trabalhadas}
                            min={0}
                            onChange={(e) => updateEquipamento(i, 'horas_trabalhadas', Number(e.target.value))}
                            className={formInputSmClassName}
                          />
                        </div>
                        <button type="button" title="Remover" onClick={() => removeEquipamento(i)} className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addEquipamento} className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar equipamento
                  </button>
                </div>
              )}

              {/* Step 4: Materiais */}
              {currentStep === 4 && (
                <div className="space-y-3">
                  {form.materiais_recebidos.map((item, i) => (
                    <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Descrição</label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) => updateMaterial(i, 'descricao', e.target.value)}
                          className={formInputSmClassName}
                          placeholder="Ex: Cimento CP-II"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Unidade</label>
                        <input
                          type="text"
                          value={item.unidade}
                          onChange={(e) => updateMaterial(i, 'unidade', e.target.value)}
                          className={formInputSmClassName}
                          placeholder="sc, m³, kg"
                        />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Quantidade</label>
                          <input
                            type="number"
                            aria-label="Quantidade do material"
                            value={item.quantidade}
                            min={0}
                            onChange={(e) => updateMaterial(i, 'quantidade', Number(e.target.value))}
                            className={formInputSmClassName}
                          />
                        </div>
                        <button type="button" title="Remover" onClick={() => removeMaterial(i)} className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addMaterial} className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline">
                    <Plus className="h-4 w-4" /> Adicionar material
                  </button>
                </div>
              )}

              {/* Step 5: Serviços Executados */}
              {currentStep === 5 && (
                <div className="space-y-3">
                  {form.servicos_executados.map((item, i) => (
                    <div key={i} className="grid grid-cols-5 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                      <div className="col-span-3">
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Descrição do serviço</label>
                        <input
                          type="text"
                          value={item.descricao}
                          onChange={(e) => updateServico(i, 'descricao', e.target.value)}
                          className={formInputSmClassName}
                          placeholder="Ex: Concretagem de laje"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">% Concluído</label>
                        <input
                          type="number"
                          aria-label="Percentual concluído"
                          value={item.percentual_concluido}
                          min={0}
                          max={100}
                          onChange={(e) => updateServico(i, 'percentual_concluido', Number(e.target.value))}
                          className={formInputSmClassName}
                        />
                      </div>
                      <div className="flex items-end">
                        <button type="button" title="Remover" onClick={() => removeServico(i)} className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addServico} className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline">
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
                        className="h-4 w-4 rounded accent-[var(--ds-color-danger)]"
                      />
                      <span className="font-medium text-[var(--ds-color-danger)]">Houve acidente</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.houve_paralisacao}
                        onChange={(e) => setForm((f) => ({ ...f, houve_paralisacao: e.target.checked }))}
                        className="h-4 w-4 rounded accent-[var(--ds-color-action-primary)]"
                      />
                      <span className="font-medium text-[var(--ds-color-action-primary)]">Houve paralisação</span>
                    </label>
                  </div>
                  {form.houve_paralisacao && (
                    <div>
                      <label htmlFor="rdo-motivo-paralisacao" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Motivo da paralisação</label>
                      <input
                        id="rdo-motivo-paralisacao"
                        type="text"
                        value={form.motivo_paralisacao}
                        onChange={(e) => setForm((f) => ({ ...f, motivo_paralisacao: e.target.value }))}
                        className={formInputClassName}
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Ocorrências</p>
                    {form.ocorrencias.map((item, i) => (
                      <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 p-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Tipo</label>
                          <select
                            aria-label="Tipo de ocorrência"
                            value={item.tipo}
                            onChange={(e) => updateOcorrencia(i, 'tipo', e.target.value)}
                            className={formInputSmClassName}
                          >
                            {OCORRENCIA_TIPO_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Descrição</label>
                          <input
                            type="text"
                            aria-label="Descrição da ocorrência"
                            placeholder="Descreva a ocorrência..."
                            value={item.descricao}
                            onChange={(e) => updateOcorrencia(i, 'descricao', e.target.value)}
                            className={formInputSmClassName}
                          />
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]">Hora</label>
                            <input
                              type="time"
                              aria-label="Hora da ocorrência"
                              value={item.hora ?? ''}
                              onChange={(e) => updateOcorrencia(i, 'hora', e.target.value)}
                              className={formInputSmClassName}
                            />
                          </div>
                          <button type="button" title="Remover" onClick={() => removeOcorrencia(i)} className="mb-0.5 rounded p-1 text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addOcorrencia} className="flex items-center gap-1 text-sm text-[var(--ds-color-action-primary)] hover:underline">
                      <Plus className="h-4 w-4" /> Adicionar ocorrência
                    </button>
                  </div>
                  <div>
                    <label htmlFor="rdo-observacoes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Observações gerais</label>
                    <textarea
                      id="rdo-observacoes"
                      value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={3}
                      className={formInputClassName}
                      placeholder="Observações relevantes do dia..."
                    />
                  </div>
                  <div>
                    <label htmlFor="rdo-programa-amanha" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Programa para amanhã</label>
                    <textarea
                      id="rdo-programa-amanha"
                      value={form.programa_servicos_amanha}
                      onChange={(e) => setForm((f) => ({ ...f, programa_servicos_amanha: e.target.value }))}
                      rows={2}
                      className={formInputClassName}
                      placeholder="Serviços planejados para o próximo dia..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--ds-color-border-subtle)] px-6 py-4">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)] transition-colors"
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => s - 1)}
                    className="flex items-center gap-1 rounded-xl border border-[var(--ds-color-border-subtle)] px-3 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </button>
                )}
                {currentStep < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((s) => s + 1)}
                    className="flex items-center gap-1 rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] transition-colors"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-xl bg-[var(--ds-color-action-primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar RDO'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de visualização ────────────────────────────────── */}
      {viewRdo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-lg)] flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--ds-color-border-subtle)] px-6 py-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-bold text-[var(--ds-color-action-primary)]">{viewRdo.numero}</span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${RDO_STATUS_COLORS[viewRdo.status] ?? ''}`}>
                  {RDO_STATUS_LABEL[viewRdo.status] ?? viewRdo.status}
                </span>
                {RDO_ALLOWED_TRANSITIONS[viewRdo.status]?.length > 0 && (
                  <select
                    aria-label="Mover status do RDO"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleStatusChange(viewRdo.id, e.target.value);
                    }}
                    className="rounded border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-1 py-0.5 text-xs text-[var(--ds-color-text-secondary)]"
                  >
                    <option value="">Mover para...</option>
                    {RDO_ALLOWED_TRANSITIONS[viewRdo.status].map((s) => (
                      <option key={s} value={s}>{RDO_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setViewRdo(null); handleOpenEdit(viewRdo); }}
                  className="flex items-center gap-1 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  aria-label="Fechar visualização"
                  onClick={() => setViewRdo(null)}
                  className="rounded-lg p-1.5 text-[var(--ds-color-text-muted)] hover:bg-[color:var(--ds-color-surface-muted)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {/* Info básica */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: 'Data', value: new Date(viewRdo.data).toLocaleDateString('pt-BR') },
                  { label: 'Obra/Setor', value: viewRdo.site?.nome ?? '—' },
                  { label: 'Responsável', value: viewRdo.responsavel?.nome ?? '—' },
                  { label: 'Trabalhadores', value: String(totalTrabalhadores(viewRdo)) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">{item.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ds-color-text-primary)]">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Flags */}
              {(viewRdo.houve_acidente || viewRdo.houve_paralisacao) && (
                <div className="flex gap-3">
                  {viewRdo.houve_acidente && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ds-color-danger)]/10 px-3 py-1 text-xs font-medium text-[var(--ds-color-danger)]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Houve acidente
                    </span>
                  )}
                  {viewRdo.houve_paralisacao && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ds-color-warning)]/10 px-3 py-1 text-xs font-medium text-[var(--ds-color-warning)]">
                      <AlertTriangle className="h-3.5 w-3.5" /> Houve paralisação{viewRdo.motivo_paralisacao ? `: ${viewRdo.motivo_paralisacao}` : ''}
                    </span>
                  )}
                </div>
              )}

              {/* Clima */}
              {(viewRdo.clima_manha || viewRdo.clima_tarde || viewRdo.temperatura_min != null) && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Sun className="h-3.5 w-3.5" /> Condições Climáticas
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {viewRdo.clima_manha && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">Manhã</p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">{CLIMA_LABEL[viewRdo.clima_manha] ?? viewRdo.clima_manha}</p>
                      </div>
                    )}
                    {viewRdo.clima_tarde && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">Tarde</p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">{CLIMA_LABEL[viewRdo.clima_tarde] ?? viewRdo.clima_tarde}</p>
                      </div>
                    )}
                    {(viewRdo.temperatura_min != null || viewRdo.temperatura_max != null) && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2 flex items-center gap-1">
                        <Thermometer className="h-3.5 w-3.5 text-[var(--ds-color-text-muted)]" />
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                          {viewRdo.temperatura_min ?? '?'}°C – {viewRdo.temperatura_max ?? '?'}°C
                        </p>
                      </div>
                    )}
                    {viewRdo.condicao_terreno && (
                      <div className="rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <p className="text-xs text-[var(--ds-color-text-muted)]">Terreno</p>
                        <p className="text-sm font-medium text-[var(--ds-color-text-primary)]">{viewRdo.condicao_terreno}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Mão de obra */}
              {(viewRdo.mao_de_obra ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Users className="h-3.5 w-3.5" /> Mão de Obra ({viewRdo.mao_de_obra!.reduce((s, m) => s + m.quantidade, 0)} trabalhadores)
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Função</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Qtd</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Turno</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.mao_de_obra!.map((m, i) => (
                          <tr key={i} className="border-b border-[var(--ds-color-border-subtle)] last:border-0">
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">{m.funcao}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{m.quantidade}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)] capitalize">{m.turno}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{m.horas}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Equipamentos */}
              {(viewRdo.equipamentos ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Wrench className="h-3.5 w-3.5" /> Equipamentos
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Equipamento</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Qtd</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">H. trabalhadas</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">H. ociosas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.equipamentos!.map((e, i) => (
                          <tr key={i} className="border-b border-[var(--ds-color-border-subtle)] last:border-0">
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">{e.nome}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{e.quantidade}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{e.horas_trabalhadas}h</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{e.horas_ociosas}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Materiais */}
              {(viewRdo.materiais_recebidos ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <Package className="h-3.5 w-3.5" /> Materiais Recebidos
                  </p>
                  <div className="rounded-xl border border-[var(--ds-color-border-subtle)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/40">
                          <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Descrição</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Qtd</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Unidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewRdo.materiais_recebidos!.map((m, i) => (
                          <tr key={i} className="border-b border-[var(--ds-color-border-subtle)] last:border-0">
                            <td className="px-3 py-2 text-[var(--ds-color-text-primary)]">{m.descricao}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{m.quantidade}</td>
                            <td className="px-3 py-2 text-center text-[var(--ds-color-text-secondary)]">{m.unidade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Serviços */}
              {(viewRdo.servicos_executados ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <CheckSquare className="h-3.5 w-3.5" /> Serviços Executados
                  </p>
                  <div className="space-y-2">
                    {viewRdo.servicos_executados!.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <span className="flex-1 text-sm text-[var(--ds-color-text-primary)]">{s.descricao}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--ds-color-border-subtle)]"
                            title={`${s.percentual_concluido}% concluído`}
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-[var(--ds-color-success)] transition-all"
                              style={{ width: `${s.percentual_concluido}%` } as React.CSSProperties}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-medium text-[var(--ds-color-text-secondary)]">{s.percentual_concluido}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ocorrências */}
              {(viewRdo.ocorrencias ?? []).length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                    <AlertTriangle className="h-3.5 w-3.5" /> Ocorrências
                  </p>
                  <div className="space-y-2">
                    {viewRdo.ocorrencias!.map((o, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-[var(--ds-color-border-subtle)] px-3 py-2">
                        <span className="rounded-full bg-[color:var(--ds-color-warning)]/10 px-2 py-0.5 text-xs font-medium text-[var(--ds-color-warning)]">
                          {OCORRENCIA_TIPO_LABEL[o.tipo] ?? o.tipo}
                        </span>
                        <span className="flex-1 text-sm text-[var(--ds-color-text-primary)]">{o.descricao}</span>
                        {o.hora && <span className="text-xs text-[var(--ds-color-text-muted)]">{o.hora}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {viewRdo.observacoes && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Observações gerais</p>
                  <p className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3 text-sm text-[var(--ds-color-text-primary)] whitespace-pre-wrap">{viewRdo.observacoes}</p>
                </div>
              )}

              {/* Programa amanhã */}
              {viewRdo.programa_servicos_amanha && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">Programa para amanhã</p>
                  <p className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/30 px-4 py-3 text-sm text-[var(--ds-color-text-primary)] whitespace-pre-wrap">{viewRdo.programa_servicos_amanha}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-[var(--ds-color-border-subtle)] px-6 py-4 flex-shrink-0">
              <button
                type="button"
                onClick={() => setViewRdo(null)}
                className="rounded-xl border border-[var(--ds-color-border-subtle)] px-4 py-2 text-sm text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)] transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
