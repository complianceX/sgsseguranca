'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  medicalExamsService,
  MedicalExam,
  MedicalExamExpirySummary,
  TIPO_EXAME_LABEL,
  RESULTADO_LABEL,
} from '@/services/medicalExamsService';
import { usersService } from '@/services/usersService';
import { downloadExcel } from '@/lib/download-excel';
import {
  Calendar,
  FileSpreadsheet,
  Pencil,
  Plus,
  ShieldAlert,
  Stethoscope,
  Trash2,
  User,
  X,
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

type UserOption = { id: string; nome: string };

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

const fieldClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60';

const labelClassName =
  'mb-1.5 block text-sm font-medium text-[var(--ds-color-text-secondary)]';

function getExpiryTone(dataVencimento: string | null) {
  if (!dataVencimento) {
    return {
      label: 'Sem vencimento',
      className:
        'bg-[color:var(--ds-color-surface-muted)]/45 text-[var(--ds-color-text-muted)]',
    };
  }

  const now = new Date();
  const expiry = new Date(dataVencimento);
  const diff = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (diff < 0) {
    return {
      label: 'Vencido',
      className: 'bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]',
    };
  }

  if (diff <= 30) {
    return {
      label: 'Vence em breve',
      className: 'bg-[color:var(--ds-color-warning)]/14 text-[var(--ds-color-warning)]',
    };
  }

  return {
    label: 'Em dia',
    className: 'bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]',
  };
}

function getResultTone(resultado: string) {
  switch (resultado) {
    case 'inapto':
      return 'bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]';
    case 'apto_com_restricoes':
      return 'bg-[color:var(--ds-color-warning)]/14 text-[var(--ds-color-warning)]';
    default:
      return 'bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]';
  }
}

export default function MedicalExamsPage() {
  const [exams, setExams] = useState<MedicalExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [users, setUsers] = useState<UserOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

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
    } catch (error) {
      console.error('Erro ao carregar exames médicos:', error);
      setLoadError('Nao foi possivel carregar o monitor de exames medicos.');
      toast.error('Erro ao carregar exames médicos.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterTipo, filterResultado]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    usersService
      .findAll()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as { data: UserOption[] }).data ?? [];
        setUsers(list);
      })
      .catch((error) => {
        console.error('Erro ao carregar colaboradores para exames médicos:', error);
        toast.error('Não foi possível carregar a lista de colaboradores.');
      });
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

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
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
        toast.success('Exame atualizado com sucesso.');
      } else {
        await medicalExamsService.create(payload);
        toast.success('Exame registrado com sucesso.');
      }

      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error('Erro ao salvar exame médico:', error);
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
      await loadData();
    } catch (error) {
      console.error('Erro ao excluir exame médico:', error);
      toast.error('Erro ao excluir exame.');
    }
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando monitor de exames médicos"
        description="Buscando vencimentos de ASO, status ocupacional e pendências do PCMSO."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar exames médicos"
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
              <Stethoscope className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Exames Médicos (PCMSO)</CardTitle>
              <CardDescription>
                Controle de ASOs conforme NR-7, com visão de vencimentos e status ocupacional.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() => downloadExcel('/medical-exams/export/excel', 'exames-medicos.xlsx')}
            >
              Exportar Excel
            </Button>
            <Button
              type="button"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
            >
              Registrar exame
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total monitorado</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>ASOs vencidos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-danger)]">
              {summary.expired}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Vencendo em 30 dias</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-warning)]">
              {summary.expiringSoon}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Exames válidos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.valid}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {summary.expired > 0 ? (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-danger)]/25 bg-[color:var(--ds-color-danger)]/10"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--ds-color-danger)]" />
              <CardTitle className="text-base">Ação recomendada</CardTitle>
            </div>
            <CardDescription>
              Existem {summary.expired} exame(s) vencido(s). Priorize a regularização para evitar
              bloqueio ocupacional e não conformidades no PCMSO.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Exames registrados</CardTitle>
            <CardDescription>
              {total} registro(s) monitorados com filtros por tipo e resultado.
            </CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <select
              value={filterTipo}
              onChange={(event) => {
                setFilterTipo(event.target.value);
                setPage(1);
              }}
              className={cn(fieldClassName, 'min-w-[220px]')}
            >
              <option value="">Todos os tipos</option>
              {Object.entries(TIPO_EXAME_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filterResultado}
              onChange={(event) => {
                setFilterResultado(event.target.value);
                setPage(1);
              }}
              className={cn(fieldClassName, 'min-w-[220px]')}
            >
              <option value="">Todos os resultados</option>
              {Object.entries(RESULTADO_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {exams.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nenhum exame médico encontrado"
                description="Ainda não existem ASOs registrados para este tenant com os filtros atuais."
                action={
                  <Button type="button" leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                    Registrar exame
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Data realização</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Médico responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => {
                  const expiryTone = getExpiryTone(exam.data_vencimento);

                  return (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-[var(--ds-color-text-primary)]">
                              {exam.user?.nome ?? 'Colaborador'}
                            </div>
                            <div className="text-xs text-[var(--ds-color-text-muted)]">
                              {exam.user?.cpf ?? `ID ${exam.user_id.slice(0, 8)}`}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {TIPO_EXAME_LABEL[exam.tipo_exame] ?? exam.tipo_exame}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                            getResultTone(exam.resultado),
                          )}
                        >
                          {RESULTADO_LABEL[exam.resultado] ?? exam.resultado}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-[var(--ds-color-text-secondary)]">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {new Date(exam.data_realizacao).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {exam.data_vencimento ? (
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(
                                'inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold',
                                expiryTone.className,
                              )}
                            >
                              {new Date(exam.data_vencimento).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-xs text-[var(--ds-color-text-muted)]">
                              {expiryTone.label}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--ds-color-text-muted)]">
                            Sem vencimento
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-[var(--ds-color-text-secondary)]">
                        {exam.medico_responsavel ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(exam)}
                            title="Editar exame"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(exam.id)}
                            title="Excluir exame"
                            className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {exams.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <Card tone="elevated" padding="none" className="w-full max-w-3xl shadow-[var(--ds-shadow-lg)]">
            <CardHeader className="border-b border-[var(--ds-color-border-subtle)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{editId ? 'Editar exame médico' : 'Registrar exame médico'}</CardTitle>
                <CardDescription>
                  Preencha os dados clínicos e de validade do ASO ocupacional.
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeModal} title="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="grid gap-4 px-6 py-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="medical-exam-user-id" className={labelClassName}>Funcionário *</label>
                <select
                  id="medical-exam-user-id"
                  value={form.user_id}
                  onChange={(event) => setForm({ ...form, user_id: event.target.value })}
                  aria-label="Funcionário do exame médico"
                  className={fieldClassName}
                  disabled={saving}
                >
                  <option value="">Selecione...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="medical-exam-tipo" className={labelClassName}>Tipo de exame *</label>
                <select
                  id="medical-exam-tipo"
                  value={form.tipo_exame}
                  onChange={(event) => setForm({ ...form, tipo_exame: event.target.value })}
                  aria-label="Tipo de exame"
                  className={fieldClassName}
                  disabled={saving}
                >
                  {Object.entries(TIPO_EXAME_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="medical-exam-resultado" className={labelClassName}>Resultado *</label>
                <select
                  id="medical-exam-resultado"
                  value={form.resultado}
                  onChange={(event) => setForm({ ...form, resultado: event.target.value })}
                  aria-label="Resultado do exame"
                  className={fieldClassName}
                  disabled={saving}
                >
                  {Object.entries(RESULTADO_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="medical-exam-data-realizacao" className={labelClassName}>Data de realização *</label>
                <input
                  id="medical-exam-data-realizacao"
                  type="date"
                  value={form.data_realizacao}
                  onChange={(event) => setForm({ ...form, data_realizacao: event.target.value })}
                  aria-label="Data de realização do exame"
                  className={fieldClassName}
                  disabled={saving}
                />
              </div>

              <div>
                <label htmlFor="medical-exam-data-vencimento" className={labelClassName}>Data de vencimento</label>
                <input
                  id="medical-exam-data-vencimento"
                  type="date"
                  value={form.data_vencimento}
                  onChange={(event) => setForm({ ...form, data_vencimento: event.target.value })}
                  aria-label="Data de vencimento do exame"
                  className={fieldClassName}
                  disabled={saving}
                />
              </div>

              <div>
                <label htmlFor="medical-exam-medico" className={labelClassName}>Médico responsável</label>
                <input
                  id="medical-exam-medico"
                  type="text"
                  value={form.medico_responsavel}
                  onChange={(event) =>
                    setForm({ ...form, medico_responsavel: event.target.value })
                  }
                  placeholder="Dr. Nome"
                  className={fieldClassName}
                  disabled={saving}
                />
              </div>

              <div>
                <label htmlFor="medical-exam-crm" className={labelClassName}>CRM</label>
                <input
                  id="medical-exam-crm"
                  type="text"
                  value={form.crm_medico}
                  onChange={(event) => setForm({ ...form, crm_medico: event.target.value })}
                  aria-label="CRM do médico"
                  placeholder="CRM/SP 123456"
                  className={fieldClassName}
                  disabled={saving}
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="medical-exam-observacoes" className={labelClassName}>Observações</label>
                <textarea
                  id="medical-exam-observacoes"
                  value={form.observacoes}
                  onChange={(event) => setForm({ ...form, observacoes: event.target.value })}
                  aria-label="Observações do exame médico"
                  rows={4}
                  className={fieldClassName}
                  disabled={saving}
                />
              </div>
            </CardContent>

            <CardFooter className="justify-end px-6 py-4">
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} loading={saving}>
                {editId ? 'Salvar alterações' : 'Registrar exame'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
