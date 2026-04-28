'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auditsService } from '@/services/auditsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useForm, useFieldArray, Control, FieldValues } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Plus, Trash2, Loader2, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';
import { attachPdfIfProvided } from '@/lib/document-upload';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { sessionStore } from '@/lib/sessionStore';
import { toInputDateValue } from '@/lib/date/safeFormat';
import { PageHeader } from '@/components/layout';
import { PageLoadingState } from '@/components/ui/state';
import { StatusPill } from '@/components/ui/status-pill';

const auditSchema = z.object({
  titulo: z.string().min(5, 'O título deve ter pelo menos 5 caracteres'),
  data_auditoria: z.string(),
  tipo_auditoria: z.string().min(1, 'O tipo de auditoria é obrigatório'),
  site_id: z.string().min(1, 'Selecione um site'),
  auditor_id: z.string().min(1, 'Selecione um auditor'),
  representantes_empresa: z.string().optional(),
  objetivo: z.string().optional(),
  escopo: z.string().optional(),
  referencias: z.array(z.string()).optional(),
  metodologia: z.string().optional(),
  caracterizacao: z.object({
    cnae: z.string().optional(),
    grau_risco: z.string().optional(),
    num_trabalhadores: z.number().optional(),
    turnos: z.string().optional(),
    atividades_principais: z.string().optional(),
  }).optional(),
  documentos_avaliados: z.array(z.string()).optional(),
  resultados_conformidades: z.array(z.string()).optional(),
  resultados_nao_conformidades: z.array(z.object({
    descricao: z.string(),
    requisito: z.string(),
    evidencia: z.string(),
    classificacao: z.enum(['Leve', 'Moderada', 'Grave', 'Crítica']),
  })).optional(),
  resultados_observacoes: z.array(z.string()).optional(),
  resultados_oportunidades: z.array(z.string()).optional(),
  avaliacao_riscos: z.array(z.object({
    perigo: z.string(),
    classificacao: z.string(),
    impactos: z.string(),
    medidas_controle: z.string(),
  })).optional(),
  plano_acao: z.array(z.object({
    item: z.string(),
    acao: z.string(),
    responsavel: z.string(),
    prazo: z.string(),
    status: z.string(),
  })).optional(),
  conclusao: z.string().optional(),
});

type AuditFormData = z.infer<typeof auditSchema>;

interface AuditFormProps {
  id?: string;
}

export function AuditForm({ id }: AuditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState(
    () => selectedTenantStore.get()?.companyId || sessionStore.get()?.companyId || '',
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      titulo: 'Relatório de Auditoria HSE',
      data_auditoria: new Date().toISOString().split('T')[0],
      tipo_auditoria: 'Interna',
      referencias: [''],
      documentos_avaliados: [''],
      resultados_conformidades: [''],
      resultados_nao_conformidades: [],
      resultados_observacoes: [''],
      resultados_oportunidades: [''],
      avaliacao_riscos: [],
      plano_acao: [],
    },
  });

  // Field Arrays
  const fieldArrayControl = control as unknown as Control<FieldValues>;
  const { fields: refFields, append: appendRef, remove: removeRef } = useFieldArray({ control: fieldArrayControl, name: 'referencias' });
  const { fields: docFields, append: appendDoc, remove: removeDoc } = useFieldArray({ control: fieldArrayControl, name: 'documentos_avaliados' });
  const { fields: confFields, append: appendConf, remove: removeConf } = useFieldArray({ control: fieldArrayControl, name: 'resultados_conformidades' });
  const { fields: ncFields, append: appendNC, remove: removeNC } = useFieldArray({ control, name: 'resultados_nao_conformidades' });
  const { fields: obsFields, append: appendObs, remove: removeObs } = useFieldArray({ control: fieldArrayControl, name: 'resultados_observacoes' });
  const { fields: opFields, append: appendOp, remove: removeOp } = useFieldArray({ control: fieldArrayControl, name: 'resultados_oportunidades' });
  const { fields: riskFields, append: appendRisk, remove: removeRisk } = useFieldArray({ control, name: 'avaliacao_riscos' });
  const { fields: actionFields, append: appendAction, remove: removeAction } = useFieldArray({ control, name: 'plano_acao' });
  const selectedSiteId = watch('site_id');
  const filteredUsers = users.filter(
    (user) => user.site_id === selectedSiteId,
  );

  useEffect(() => {
    const unsubscribe = selectedTenantStore.subscribe((tenant) => {
      setActiveCompanyId(tenant?.companyId || sessionStore.get()?.companyId || '');
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sitesData, usersData] = activeCompanyId
          ? await Promise.all([
              sitesService.findPaginated({
                page: 1,
                limit: 100,
                companyId: activeCompanyId,
              }),
              usersService.findPaginated({
                page: 1,
                limit: 100,
                companyId: activeCompanyId,
                siteId: selectedSiteId || undefined,
              }),
            ])
          : [
              { data: [], total: 0, page: 1, lastPage: 1 },
              { data: [], total: 0, page: 1, lastPage: 1 },
            ];
        setSites(sitesData.data);
        setUsers(usersData.data);

        if (sitesData.lastPage > 1) {
          toast.warning('A lista de sites foi limitada aos primeiros 100 registros.');
        }
        if (usersData.lastPage > 1) {
          toast.warning('A lista de usuários foi limitada aos primeiros 100 registros.');
        }

        if (id) {
          const audit = await auditsService.findOne(id);
          reset({
            ...audit,
            data_auditoria: toInputDateValue(audit.data_auditoria),
          });
        }
      } catch {
        toast.error('Erro ao carregar dados');
      } finally {
        setFetching(false);
      }
    };

    void fetchData();
  }, [activeCompanyId, id, reset, selectedSiteId]);

  const onSubmit = async (data: AuditFormData) => {
    setLoading(true);
    try {
      setSubmitError(null);
      if (id) {
        const updated = await auditsService.update(id, data);
        await attachPdfIfProvided(updated.id, pdfFile, auditsService.attachFile);
        toast.success('Auditoria atualizada com sucesso');
      } else {
        const created = await auditsService.create(data);
        await attachPdfIfProvided(created.id, pdfFile, auditsService.attachFile);
        toast.success('Auditoria criada com sucesso');
      }
      router.push('/dashboard/audits');
    } catch (error) {
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar auditorias.',
        server: 'Erro interno do servidor ao salvar auditoria.',
        fallback: 'Erro ao salvar auditoria. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar auditoria');
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (formErrors: FieldErrors<AuditFormData>) => {
    if (formErrors.titulo) {
      setFocus('titulo');
    } else if (formErrors.site_id) {
      setFocus('site_id');
    } else if (formErrors.tipo_auditoria) {
      setFocus('tipo_auditoria');
    } else if (formErrors.auditor_id) {
      setFocus('auditor_id');
    }
    toast.error('Revise os campos obrigatórios antes de salvar.');
  };

  if (fetching) {
    return (
      <PageLoadingState
        title={id ? 'Carregando auditoria' : 'Preparando auditoria'}
        description="Buscando site, auditor, estruturas do relatório e dados do documento."
        cards={3}
        tableRows={4}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="ds-form-page space-y-8 pb-12">
      <PageHeader
        eyebrow="Relatórios de auditoria"
        title={id ? 'Editar auditoria' : 'Nova auditoria'}
        description="Estruture identificação, achados, avaliação de riscos e plano de ação em um único relatório."
        icon={<ClipboardCheck className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="info">Auditoria</StatusPill>
            <StatusPill tone={id ? 'warning' : 'success'}>
              {id ? 'Edição' : 'Novo cadastro'}
            </StatusPill>
            <StatusPill tone="neutral">
              {activeCompanyId ? 'Tenant ativo' : 'Tenant pendente'}
            </StatusPill>
          </div>
        }
      />

      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Relatório guiado
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
          Registre o contexto da auditoria, consolide conformidades e feche o plano de ação com rastreabilidade.
        </p>
        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
          Revise site, auditor, tipo de auditoria e achados críticos antes de salvar para evitar retrabalho documental.
        </p>
      </div>

      {submitError && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger)]"
        >
          <p className="font-semibold">Não foi possível salvar a auditoria</p>
          <p className="mt-1 text-[color:var(--ds-color-danger)]/90">{submitError}</p>
        </div>
      )}
      {/* 1. Identificação */}
      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)] flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-[var(--ds-color-text-primary)]" />
          1. Identificação do Documento
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="audit-titulo" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Título</label>
            <input
              id="audit-titulo"
              {...register('titulo')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.titulo ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.titulo ? 'true' : undefined}
            />
            {errors.titulo && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.titulo.message}</p>}
          </div>

          <div>
            <label htmlFor="audit-site-id" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Unidade/Site</label>
            <select
              id="audit-site-id"
              {...register('site_id')}
              aria-label="Unidade ou site da auditoria"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.site_id ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.site_id ? 'true' : undefined}
            >
              <option value="">Selecione um site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.nome}</option>
              ))}
            </select>
            {errors.site_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.site_id.message}</p>}
          </div>

          <div>
            <label htmlFor="audit-data-auditoria" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Data da Auditoria</label>
            <input
              id="audit-data-auditoria"
              type="date"
              {...register('data_auditoria')}
              aria-label="Data da auditoria"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="audit-tipo-auditoria" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Tipo de Auditoria</label>
            <select
              id="audit-tipo-auditoria"
              {...register('tipo_auditoria')}
              aria-label="Tipo de auditoria"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.tipo_auditoria ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.tipo_auditoria ? 'true' : undefined}
            >
              <option value="Interna">Interna</option>
              <option value="Externa">Externa</option>
              <option value="Cliente">Cliente</option>
              <option value="Legal">Legal</option>
              <option value="Sistema de Gestão">Sistema de Gestão</option>
            </select>
            {errors.tipo_auditoria && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.tipo_auditoria.message}</p>}
          </div>

          <div>
            <label htmlFor="audit-auditor-id" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Auditor Responsável</label>
            <select
              id="audit-auditor-id"
              {...register('auditor_id')}
              aria-label="Auditor responsável"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.auditor_id ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.auditor_id ? 'true' : undefined}
            >
              <option value="">Selecione o auditor</option>
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.nome}</option>
              ))}
            </select>
            {errors.auditor_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.auditor_id.message}</p>}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="audit-representantes-empresa" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Representantes da Empresa</label>
            <textarea
              id="audit-representantes-empresa"
              {...register('representantes_empresa')}
              rows={2}
              aria-label="Representantes da empresa"
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Nomes dos representantes que acompanharam a auditoria"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="audit-pdf-file" className="mb-2 block text-sm font-bold text-[var(--ds-color-text-secondary)]">Anexar PDF da Auditoria (opcional)</label>
            <input
              id="audit-pdf-file"
              type="file"
              accept="application/pdf"
              aria-label="Selecionar PDF da auditoria"
              onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--ds-color-surface-muted)] file:px-3 file:py-1.5 file:font-semibold file:text-[var(--ds-color-text-secondary)] hover:file:bg-[var(--ds-color-primary-subtle)]"
            />
          </div>
        </div>
      </div>

      {/* 2 & 3. Objetivo e Escopo */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="sst-card p-6">
          <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">2. Objetivo</h2>
          <textarea
            {...register('objetivo')}
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="sst-card p-6">
          <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">3. Escopo</h2>
          <textarea
            {...register('escopo')}
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 4 & 5. Referências e Metodologia */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">4. Referências</h2>
            <button
              type="button"
              onClick={() => appendRef('')}
              className="text-[var(--ds-color-text-primary)] hover:text-[var(--ds-color-text-primary)]"
              title="Adicionar Referência"
              aria-label="Adicionar Referência"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          {refFields.map((field, index) => (
            <div key={field.id} className="mb-2 flex gap-2">
              <input
                {...register(`referencias.${index}` as const)}
                className="flex-1 rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeRef(index)}
                className="text-[var(--ds-color-danger)]"
                title="Remover Referência"
                aria-label="Remover Referência"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="sst-card p-6">
          <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">5. Metodologia</h2>
          <textarea
            {...register('metodologia')}
            rows={4}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* 6. Caracterização */}
      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">6. Caracterização da Empresa</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">CNAE</label>
            <input {...register('caracterizacao.cnae')} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Grau de Risco</label>
            <input {...register('caracterizacao.grau_risco')} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Nº Trabalhadores</label>
            <input type="number" {...register('caracterizacao.num_trabalhadores', { valueAsNumber: true })} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Atividades Principais</label>
            <textarea {...register('caracterizacao.atividades_principais')} rows={2} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* 7. Documentos Avaliados */}
      <div className="sst-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">7. Documentos Avaliados</h2>
          <button
            type="button"
            onClick={() => appendDoc('')}
            className="text-[var(--ds-color-text-primary)] hover:text-[var(--ds-color-text-primary)]"
            title="Adicionar Documento"
            aria-label="Adicionar Documento"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {docFields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`documentos_avaliados.${index}` as const)}
                className="flex-1 rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeDoc(index)}
                className="text-[var(--ds-color-danger)]"
                title="Remover Documento"
                aria-label="Remover Documento"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 8. Resultados */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-[var(--ds-color-text-primary)] border-b pb-2">8. Resultados da Auditoria</h2>
        
        {/* Conformidades */}
        <div className="rounded-xl border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-[var(--ds-color-success)]">8.1 Conformidades</h3>
            <button
              type="button"
              onClick={() => appendConf('')}
              className="text-[var(--ds-color-success)] hover:text-[var(--ds-color-success-hover)]"
              title="Adicionar Conformidade"
              aria-label="Adicionar Conformidade"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          {confFields.map((field, index) => (
            <div key={field.id} className="mb-2 flex gap-2">
              <input
                {...register(`resultados_conformidades.${index}` as const)}
                className="flex-1 rounded-md border border-[var(--ds-color-success-border)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => removeConf(index)}
                className="text-[var(--ds-color-danger)]"
                title="Remover Conformidade"
                aria-label="Remover Conformidade"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Não Conformidades */}
        <div className="rounded-xl border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-[var(--ds-color-danger)]">8.2 Não Conformidades</h3>
            <button
              type="button"
              onClick={() => appendNC({ descricao: '', requisito: '', evidencia: '', classificacao: 'Moderada' })}
              className="flex items-center gap-1 rounded-md bg-[var(--ds-color-danger)] px-3 py-1 text-sm text-[var(--ds-color-danger-fg)]"
              title="Adicionar Não Conformidade"
              aria-label="Adicionar Não Conformidade"
            >
              <Plus className="h-4 w-4" /> Adicionar NC
            </button>
          </div>
          <div className="space-y-4">
            {ncFields.map((field, index) => (
              <div key={field.id} className="relative rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-surface-base)] p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => removeNC(index)}
                  className="absolute top-2 right-2 text-[var(--ds-color-danger)] hover:text-[var(--ds-color-danger-hover,var(--ds-color-danger))]"
                  title="Remover Não Conformidade"
                  aria-label="Remover Não Conformidade"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Descrição do Desvio</label>
                    <textarea {...register(`resultados_nao_conformidades.${index}.descricao` as const)} rows={2} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Requisito Legal/Normativo</label>
                    <input {...register(`resultados_nao_conformidades.${index}.requisito` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Evidência Observada</label>
                    <input {...register(`resultados_nao_conformidades.${index}.evidencia` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Classificação</label>
                    <select {...register(`resultados_nao_conformidades.${index}.classificacao` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm">
                      <option value="Leve">Leve</option>
                      <option value="Moderada">Moderada</option>
                      <option value="Grave">Grave</option>
                      <option value="Crítica">Crítica</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Observações e Oportunidades */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[var(--ds-color-text-primary)]">8.3 Observações</h3>
              <button
                type="button"
                onClick={() => appendObs('')}
                className="text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]"
                title="Adicionar Observação"
                aria-label="Adicionar Observação"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {obsFields.map((field, index) => (
              <div key={field.id} className="mb-2 flex gap-2">
                <input {...register(`resultados_observacoes.${index}` as const)} className="flex-1 rounded-md border px-3 py-2 text-sm" />
                <button
                  type="button"
                  onClick={() => removeObs(index)}
                  className="text-[var(--ds-color-danger)]"
                  title="Remover Observação"
                  aria-label="Remover Observação"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-[var(--ds-color-warning)]">8.4 Oportunidades de Melhoria</h3>
              <button
                type="button"
                onClick={() => appendOp('')}
                className="text-[var(--ds-color-warning)] hover:text-[var(--ds-color-warning)]"
                title="Adicionar Oportunidade"
                aria-label="Adicionar Oportunidade"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {opFields.map((field, index) => (
              <div key={field.id} className="mb-2 flex gap-2">
                <input {...register(`resultados_oportunidades.${index}` as const)} className="flex-1 rounded-md border border-[var(--ds-color-warning-border)] px-3 py-2 text-sm" />
                <button
                  type="button"
                  onClick={() => removeOp(index)}
                  className="text-[var(--ds-color-danger)]"
                  title="Remover Oportunidade"
                  aria-label="Remover Oportunidade"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 9. Avaliação de Riscos */}
      <div className="sst-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">9. Avaliação de Riscos Identificados</h2>
          <button
            type="button"
            onClick={() => appendRisk({ perigo: '', classificacao: '', impactos: '', medidas_controle: '' })}
            className="flex items-center gap-1 rounded-md bg-[var(--ds-color-action-primary)] px-3 py-1 text-sm text-[var(--ds-color-action-primary-foreground)] hover:bg-[var(--ds-color-action-primary-hover)]"
            title="Adicionar Avaliação de Risco"
            aria-label="Adicionar Avaliação de Risco"
          >
            <Plus className="h-4 w-4" /> Adicionar Risco
          </button>
        </div>
        <div className="space-y-4">
          {riskFields.map((field, index) => (
            <div key={field.id} className="rounded-lg border border-[var(--ds-color-border-default)] p-4 relative">
              <button
                type="button"
                onClick={() => removeRisk(index)}
                className="absolute top-2 right-2 text-[var(--ds-color-danger)]"
                title="Remover Avaliação de Risco"
                aria-label="Remover Avaliação de Risco"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Perigo/Risco</label>
                  <input {...register(`avaliacao_riscos.${index}.perigo` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Classificação</label>
                  <input {...register(`avaliacao_riscos.${index}.classificacao` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Impactos</label>
                  <input {...register(`avaliacao_riscos.${index}.impactos` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--ds-color-text-muted)]">Medidas de Controle</label>
                  <input {...register(`avaliacao_riscos.${index}.medidas_controle` as const)} className="w-full rounded-md border border-[var(--ds-color-border-default)] px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 10. Plano de Ação */}
      <div className="sst-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">10. Plano de Ação</h2>
          <button
            type="button"
            onClick={() => appendAction({ item: '', acao: '', responsavel: '', prazo: '', status: 'Pendente' })}
            className="flex items-center gap-1 rounded-md bg-[var(--ds-color-action-primary)] px-3 py-1 text-sm text-[var(--ds-color-action-primary-foreground)] hover:bg-[var(--ds-color-action-primary-hover)]"
            title="Adicionar Ação ao Plano de Ação"
            aria-label="Adicionar Ação ao Plano de Ação"
          >
            <Plus className="h-4 w-4" /> Adicionar Ação
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] font-bold">
              <tr>
                <th className="px-3 py-2">NC/Oportunidade</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {actionFields.map((field, index) => (
                <tr key={field.id} className="border-t">
                  <td className="p-2"><input {...register(`plano_acao.${index}.item` as const)} className="w-full border rounded px-2 py-1" /></td>
                  <td className="p-2"><input {...register(`plano_acao.${index}.acao` as const)} className="w-full border rounded px-2 py-1" /></td>
                  <td className="p-2"><input {...register(`plano_acao.${index}.responsavel` as const)} className="w-full border rounded px-2 py-1" /></td>
                  <td className="p-2"><input {...register(`plano_acao.${index}.prazo` as const)} className="w-full border rounded px-2 py-1" /></td>
                  <td className="p-2">
                    <select {...register(`plano_acao.${index}.status` as const)} className="w-full border rounded px-2 py-1">
                      <option value="Pendente">Pendente</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeAction(index)}
                      className="text-[var(--ds-color-danger)]"
                      title="Remover Ação"
                      aria-label="Remover Ação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 11. Conclusão */}
      <div className="sst-card p-6">
        <h2 className="mb-4 text-lg font-bold text-[var(--ds-color-text-primary)]">11. Conclusão da Auditoria</h2>
        <textarea
          {...register('conclusao')}
          rows={6}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Síntese geral do nível de conformidade HSE, principais pontos críticos e grau de maturidade..."
        />
      </div>

      {/* Ações do Formulário */}
      <div className="flex justify-end space-x-4 border-t pt-6">
        <Link
          href="/dashboard/audits"
          className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-6 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={loading || isSubmitting || !isValid}
          className="flex items-center space-x-2 rounded-lg bg-[var(--ds-color-action-primary)] px-10 py-2 text-sm font-bold text-[var(--ds-color-action-primary-foreground)] shadow-lg transition-all hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50 active:scale-95"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>{id ? 'Salvar Alterações' : 'Criar Relatório de Auditoria'}</span>
        </button>
      </div>
    </form>
  );
}
