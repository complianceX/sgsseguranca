'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardList,
  Save,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SummaryMetricCard } from '@/components/ui/summary-metric-card';
import { StatusPill } from '@/components/ui/status-pill';
import { PageLoadingState } from '@/components/ui/state';
import {
  FormFieldGroup,
  FormGrid,
  FormPageLayout,
  FormSection,
} from '@/components/layout';
import { companiesService, type Company } from '@/services/companiesService';
import {
  DID_STATUS_LABEL,
  didsService,
  type Did,
  type DidMutationInput,
} from '@/services/didsService';
import { sitesService, type Site } from '@/services/sitesService';
import { usersService, type User } from '@/services/usersService';
import { getFormErrorMessage } from '@/lib/error-handler';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { sessionStore } from '@/lib/sessionStore';
import { usePermissions } from '@/hooks/usePermissions';
import { isAdminGeralAccount } from '@/lib/auth-session-state';
import { cn } from '@/lib/utils';

const didSchema = z.object({
  titulo: z.string().min(5, 'Informe um título com pelo menos 5 caracteres.'),
  descricao: z.string().optional(),
  data: z.string().min(1, 'Informe a data do diálogo.'),
  turno: z.string().optional(),
  frente_trabalho: z.string().optional(),
  atividade_principal: z
    .string()
    .min(5, 'Informe a atividade principal do dia.'),
  atividades_planejadas: z
    .string()
    .min(10, 'Detalhe as atividades planejadas.'),
  riscos_operacionais: z
    .string()
    .min(10, 'Detalhe os riscos operacionais do dia.'),
  controles_planejados: z
    .string()
    .min(10, 'Detalhe os controles planejados.'),
  epi_epc_aplicaveis: z.string().optional(),
  observacoes: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa.'),
  site_id: z.string().min(1, 'Selecione um site.'),
  responsavel_id: z.string().min(1, 'Selecione o responsável.'),
  participants: z
    .array(z.string())
    .min(1, 'Selecione pelo menos um participante.'),
});

type DidFormData = z.infer<typeof didSchema>;

type DidFormProps = {
  id?: string;
};

const inputClassName =
  'mt-1 block w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border-subtle)] bg-[var(--component-field-bg)] px-3 py-2.5 text-sm text-[var(--component-field-text)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';

const textareaClassName = `${inputClassName} min-h-[128px]`;
const labelClassName =
  'text-sm font-medium text-[var(--ds-color-text-secondary)]';
const helperClassName = 'mt-1 text-xs text-[var(--ds-color-text-muted)]';
const errorClassName = 'mt-1 text-xs text-[var(--ds-color-danger)]';

const TURNO_LABEL: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  integral: 'Integral',
};

function getInitialCompanyId() {
  const selectedTenantCompanyId = selectedTenantStore.get()?.companyId || null;
  const sessionCompanyId = sessionStore.get()?.companyId || null;
  return selectedTenantCompanyId || sessionCompanyId || '';
}

function getUserInitials(name?: string | null) {
  if (!name) {
    return '??';
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function DidForm({ id }: DidFormProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canManageDids = hasPermission('can_manage_dids');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentDid, setCurrentDid] = useState<Did | null>(null);
  const isAdminGeral = isAdminGeralAccount(
    sessionStore.get()?.profileName,
    sessionStore.get()?.roles || [],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid, isSubmitting },
  } = useForm<DidFormData>({
    resolver: zodResolver(didSchema),
    mode: 'onBlur',
    defaultValues: {
      titulo: '',
      descricao: '',
      data: new Date().toISOString().split('T')[0],
      turno: '',
      frente_trabalho: '',
      atividade_principal: '',
      atividades_planejadas: '',
      riscos_operacionais: '',
      controles_planejados: '',
      epi_epc_aplicaveis: '',
      observacoes: '',
      company_id: getInitialCompanyId(),
      site_id: '',
      responsavel_id: '',
      participants: [],
    },
  });

  const selectedCompanyId = watch('company_id');
  const selectedSiteId = watch('site_id');
  const selectedParticipantIds = watch('participants') || [];
  const selectedTurno = watch('turno');
  const selectedTitle = watch('titulo');
  const selectedMainActivity = watch('atividade_principal');

  const filteredSites = useMemo(
    () => sites.filter((site) => site.company_id === selectedCompanyId),
    [selectedCompanyId, sites],
  );
  const filteredUsers = useMemo(
    () => users.filter((user) => user.company_id === selectedCompanyId),
    [selectedCompanyId, users],
  );

  const isReadOnly =
    Boolean(currentDid?.pdf_file_key) || currentDid?.status === 'arquivado';
  const readOnlyMessage = currentDid?.pdf_file_key
    ? 'Este Diálogo do Início do Dia já possui PDF final governado e não aceita edição.'
    : currentDid?.status === 'arquivado'
      ? 'Este Diálogo do Início do Dia está arquivado e não aceita edição.'
      : null;
  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );
  const selectedSite = useMemo(
    () => filteredSites.find((site) => site.id === selectedSiteId) || null,
    [filteredSites, selectedSiteId],
  );

  useEffect(() => {
    async function loadData() {
      try {
        let companiesData: Company[] = [];
        try {
          const companiesPage = await companiesService.findPaginated({
            page: 1,
            limit: 200,
          });
          companiesData = companiesPage.data;
          if (companiesPage.lastPage > 1) {
            toast.warning(
              'A lista de empresas foi limitada aos primeiros 200 registros.',
            );
          }
        } catch {
          companiesData = [];
        }

        setCompanies(companiesData);

        if (!id) {
          const initialCompanyId = getInitialCompanyId();
          if (!initialCompanyId && companiesData.length === 1) {
            setValue('company_id', companiesData[0].id, {
              shouldValidate: true,
            });
          }
          return;
        }

        const did = await didsService.findOne(id);
        setCurrentDid(did);
        reset({
          titulo: did.titulo,
          descricao: did.descricao || '',
          data: String(did.data).slice(0, 10),
          turno: did.turno || '',
          frente_trabalho: did.frente_trabalho || '',
          atividade_principal: did.atividade_principal,
          atividades_planejadas: did.atividades_planejadas,
          riscos_operacionais: did.riscos_operacionais,
          controles_planejados: did.controles_planejados,
          epi_epc_aplicaveis: did.epi_epc_aplicaveis || '',
          observacoes: did.observacoes || '',
          company_id: did.company_id,
          site_id: did.site_id,
          responsavel_id: did.responsavel_id,
          participants: (did.participants || []).map((participant) => participant.id),
        });
      } catch (error) {
        toast.error(
          getFormErrorMessage(error, {
            fallback:
              'Nao foi possivel carregar os dados do Diálogo do Início do Dia.',
          }),
        );
      } finally {
        setFetching(false);
      }
    }

    void loadData();
  }, [id, reset, setValue]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanyScopedCatalogs() {
      if (!selectedCompanyId) {
        setSites([]);
        setUsers([]);
        return;
      }

      const selectedCompany = companies.find(
        (company) => company.id === selectedCompanyId,
      );

      if (isAdminGeral) {
        selectedTenantStore.set({
          companyId: selectedCompanyId,
          companyName:
            selectedCompany?.razao_social || 'Empresa selecionada',
        });
      }

      const [sitesResult, usersResult] = await Promise.allSettled([
        sitesService.findPaginated({
          page: 1,
          limit: 200,
          companyId: selectedCompanyId,
        }),
        usersService.findPaginated({
          page: 1,
          limit: 200,
          companyId: selectedCompanyId,
        }),
      ]);

      if (cancelled) {
        return;
      }

      if (sitesResult.status === 'fulfilled') {
        setSites(sitesResult.value.data);
      } else {
        setSites([]);
      }

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value.data);
      } else {
        setUsers([]);
      }

      if (
        sitesResult.status === 'fulfilled' &&
        sitesResult.value.lastPage > 1
      ) {
        toast.warning(
          'A lista de sites foi limitada aos primeiros 200 registros para manter performance.',
        );
      }

      if (
        usersResult.status === 'fulfilled' &&
        usersResult.value.lastPage > 1
      ) {
        toast.warning(
          'A lista de usuários foi limitada aos primeiros 200 registros para manter performance.',
        );
      }

      const failedCatalogs = [
        sitesResult.status === 'rejected' ? 'sites' : null,
        usersResult.status === 'rejected' ? 'usuários' : null,
      ].filter(Boolean);

      if (failedCatalogs.length > 0) {
        toast.warning(
          `Parte do catálogo do Início do Dia não pôde ser carregada para a empresa selecionada: ${failedCatalogs.join(', ')}.`,
        );
      }
    }

    void loadCompanyScopedCatalogs();

    return () => {
      cancelled = true;
    };
  }, [companies, isAdminGeral, selectedCompanyId]);

  const toggleParticipant = (userId: string) => {
    const current = selectedParticipantIds || [];
    const next = current.includes(userId)
      ? current.filter((item) => item !== userId)
      : [...current, userId];

    setValue('participants', next, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleCompanyChange = (companyId: string) => {
    if (isAdminGeral && companyId) {
      const selectedCompany = companies.find((company) => company.id === companyId);
      selectedTenantStore.set({
        companyId,
        companyName: selectedCompany?.razao_social || 'Empresa selecionada',
      });
    }
    setValue('company_id', companyId, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setValue('site_id', '', { shouldValidate: true });
    setValue('responsavel_id', '', { shouldValidate: true });
    setValue('participants', [], { shouldValidate: true });
  };

  const onSubmit = async (data: DidFormData) => {
    const payload: DidMutationInput = {
      ...data,
      descricao: data.descricao || undefined,
      turno: data.turno || undefined,
      frente_trabalho: data.frente_trabalho || undefined,
      epi_epc_aplicaveis: data.epi_epc_aplicaveis || undefined,
      observacoes: data.observacoes || undefined,
    };

    try {
      setSaving(true);

      if (id) {
        await didsService.update(id, payload);
        toast.success('Diálogo do Início do Dia atualizado com sucesso.');
      } else {
        await didsService.create(payload);
        toast.success('Diálogo do Início do Dia criado com sucesso.');
      }

      router.push('/dashboard/dids');
      router.refresh();
    } catch (error) {
      toast.error(
        getFormErrorMessage(error, {
          badRequest:
            'Nao foi possivel salvar o documento. Revise os campos obrigatorios.',
          forbidden:
            'Voce nao tem permissao para salvar o Diálogo do Início do Dia.',
          notFound: 'Registro nao encontrado.',
          fallback:
            'Nao foi possivel salvar o Diálogo do Início do Dia.',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (fetching) {
    return (
      <PageLoadingState
        title={id ? 'Carregando DID' : 'Preparando DID'}
        description="Buscando empresa, frente, participantes e dados do diálogo."
        cards={2}
        tableRows={3}
      />
    );
  }

  if (!canManageDids) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/8 px-5 py-4 text-sm text-[var(--ds-color-danger)]"
      >
        <p className="font-semibold">Acesso bloqueado</p>
        <p className="mt-1 text-[color:var(--ds-color-danger)]/90">
          Voce nao tem permissao para criar ou editar Dialogos do Inicio do Dia.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-6xl pb-10">
      <FormPageLayout
        className="space-y-7"
        eyebrow="Formalização diária"
        title={id ? 'Editar Diálogo do Início do Dia' : 'Novo Diálogo do Início do Dia'}
        description="Um layout mais limpo para registrar equipe, atividade e combinados do turno sem burocracia."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="info">DID</StatusPill>
            <StatusPill tone={id ? 'warning' : 'success'}>
              {id ? 'Edição' : 'Novo registro'}
            </StatusPill>
            <StatusPill tone={isReadOnly ? 'warning' : 'success'}>
              {isReadOnly ? 'Somente leitura' : 'Fluxo ativo'}
            </StatusPill>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/dashboard/dids')}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para DIDs
            </Button>
          </div>
        }
        summary={
          <>
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
                Fluxo guiado
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Estruture empresa, frente, atividade e equipe antes de consolidar os combinados do dia.
              </p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                O foco aqui é dar leitura rápida para o campo sem perder rastreabilidade do alinhamento diário.
              </p>
            </div>
            {readOnlyMessage ? (
              <div
                role="alert"
                className="rounded-[var(--ds-radius-xl)] border border-[color:var(--ds-color-warning)]/30 bg-[color:var(--ds-color-warning-subtle)] px-5 py-4 text-sm text-[color:var(--ds-color-warning)]"
              >
                <p className="font-semibold text-[color:var(--ds-color-warning)]">
                  Documento travado para edição
                </p>
                <p className="mt-1 text-[color:var(--ds-color-warning)]/90">
                  {readOnlyMessage}
                </p>
              </div>
            ) : null}
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryMetricCard
                label="Status visual"
                value={currentDid ? DID_STATUS_LABEL[currentDid.status] : 'Rascunho'}
                note={isReadOnly ? 'Registro finalizado.' : 'Registro pronto para edição.'}
                tone="primary"
              />
              <SummaryMetricCard
                label="Turno"
                value={selectedTurno ? TURNO_LABEL[selectedTurno] || selectedTurno : 'A definir'}
                note={selectedCompany?.razao_social || currentDid?.company?.razao_social || 'Selecione a empresa'}
                tone="info"
              />
              <SummaryMetricCard
                label="Equipe"
                value={selectedParticipantIds.length}
                note="participante(s) marcados"
                tone="success"
              />
              <SummaryMetricCard
                label="Frente / atividade"
                value={selectedSite?.nome || currentDid?.site?.nome || 'Local pendente'}
                note={selectedMainActivity || currentDid?.atividade_principal || selectedTitle || 'Defina o foco do alinhamento'}
              />
            </section>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone="info">
                {selectedCompany?.razao_social || 'Empresa pendente'}
              </StatusPill>
              <StatusPill tone="warning">
                {selectedSite?.nome || 'Site / frente pendente'}
              </StatusPill>
              <StatusPill tone="success">
                {selectedParticipantIds.length} participante(s)
              </StatusPill>
            </div>
          </>
        }
        footer={
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                DID com leitura mais clara e preenchimento mais direto
              </p>
              <p className="text-sm text-[var(--ds-color-text-muted)]">
                Revise equipe, atividade e observações antes de salvar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => router.push('/dashboard/dids')}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="lg"
                className="w-full sm:w-auto"
                loading={saving || isSubmitting}
                disabled={isReadOnly || !isValid}
              >
                {!saving && !isSubmitting ? <Save className="h-4 w-4" /> : null}
                {id ? 'Salvar alterações' : 'Salvar DID'}
              </Button>
            </div>
          </div>
        }
      >
        <fieldset
          disabled={isReadOnly || saving || isSubmitting}
          className={cn('space-y-6', isReadOnly && 'opacity-90')}
        >
          <FormSection
            title="Contexto do dia"
            description="Defina o básico do alinhamento com mais clareza visual."
            icon={<CalendarDays className="h-4 w-4" />}
            badge="Etapa 1"
            className="border-l-4 border-l-[var(--ds-color-info)]"
          >
            <FormGrid cols={2}>
              <div className="md:col-span-2">
                <label htmlFor="did-titulo" className={labelClassName}>
                  Título
                </label>
                <input
                  id="did-titulo"
                  type="text"
                  {...register('titulo')}
                  className={inputClassName}
                  placeholder="Ex.: Alinhamento da equipe de montagem"
                />
                {errors.titulo ? (
                  <p className={errorClassName}>{errors.titulo.message}</p>
                ) : (
                  <p className={helperClassName}>
                    Use um título curto que identifique o DID com facilidade.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="did-data" className={labelClassName}>
                  Data
                </label>
                <input
                  id="did-data"
                  type="date"
                  {...register('data')}
                  className={inputClassName}
                />
                {errors.data ? <p className={errorClassName}>{errors.data.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-turno" className={labelClassName}>
                  Turno
                </label>
                <select id="did-turno" {...register('turno')} className={inputClassName}>
                  <option value="">Selecione</option>
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                  <option value="integral">Integral</option>
                </select>
              </div>

              <div>
                <label htmlFor="did-company" className={labelClassName}>
                  Empresa
                </label>
                <select
                  id="did-company"
                  {...register('company_id')}
                  onChange={(event) => handleCompanyChange(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Selecione a empresa</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.razao_social}
                    </option>
                  ))}
                </select>
                {errors.company_id ? (
                  <p className={errorClassName}>{errors.company_id.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="did-site" className={labelClassName}>
                  Site / frente
                </label>
                <select
                  id="did-site"
                  {...register('site_id')}
                  className={inputClassName}
                  disabled={!selectedCompanyId}
                >
                  <option value="">
                    {selectedCompanyId ? 'Selecione o site' : 'Selecione uma empresa primeiro'}
                  </option>
                  {filteredSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                {errors.site_id ? <p className={errorClassName}>{errors.site_id.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-responsavel" className={labelClassName}>
                  Responsável
                </label>
                <select
                  id="did-responsavel"
                  {...register('responsavel_id')}
                  className={inputClassName}
                  disabled={!selectedCompanyId}
                >
                  <option value="">
                    {selectedCompanyId ? 'Selecione o responsável' : 'Selecione uma empresa primeiro'}
                  </option>
                  {filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                    </option>
                  ))}
                </select>
                {errors.responsavel_id ? (
                  <p className={errorClassName}>{errors.responsavel_id.message}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="did-frente" className={labelClassName}>
                  Frente de trabalho
                </label>
                <input
                  id="did-frente"
                  type="text"
                  {...register('frente_trabalho')}
                  className={inputClassName}
                  placeholder="Ex.: Galpão 02, Área externa, Setor B"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="did-descricao" className={labelClassName}>
                  Descrição e objetivo do alinhamento
                </label>
                <textarea
                  id="did-descricao"
                  {...register('descricao')}
                  className={textareaClassName}
                  placeholder="Explique rapidamente o foco do alinhamento e o combinado principal do dia."
                />
              </div>
            </FormGrid>
          </FormSection>

          <FormSection
            title="Conteúdo operacional"
            description="Separe o plano do turno, os pontos de atenção e os complementos em blocos mais legíveis."
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            badge="Etapa 2"
            className="border-l-4 border-l-[var(--ds-color-warning)]"
          >
            <div className="space-y-5">
              <FormFieldGroup
                tone="primary"
                label="Plano do turno"
                description="Organize o que será feito e como a equipe deve se orientar."
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] px-4 py-4"
              >
                <FormGrid cols={1}>
                  <div>
                    <label htmlFor="did-atividade-principal" className={labelClassName}>
                      Atividade principal
                    </label>
                    <input
                      id="did-atividade-principal"
                      type="text"
                      {...register('atividade_principal')}
                      className={inputClassName}
                      placeholder="Ex.: Montagem de linha, concretagem, inspeção visual"
                    />
                    {errors.atividade_principal ? (
                      <p className={errorClassName}>{errors.atividade_principal.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="did-atividades-planejadas" className={labelClassName}>
                      Atividades planejadas
                    </label>
                    <textarea
                      id="did-atividades-planejadas"
                      {...register('atividades_planejadas')}
                      className={cn(textareaClassName, 'min-h-[144px]')}
                      placeholder="Liste as frentes, a sequência ou os combinados principais do dia."
                    />
                    {errors.atividades_planejadas ? (
                      <p className={errorClassName}>{errors.atividades_planejadas.message}</p>
                    ) : null}
                  </div>
                </FormGrid>
              </FormFieldGroup>

              <FormFieldGroup
                tone="warning"
                label="Riscos e controles"
                description="Deixe claro o que merece atenção e como a equipe deve se organizar."
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] px-4 py-4"
              >
                <FormGrid cols={2}>
                  <div>
                    <label htmlFor="did-riscos-operacionais" className={labelClassName}>
                      Riscos operacionais
                    </label>
                    <textarea
                      id="did-riscos-operacionais"
                      {...register('riscos_operacionais')}
                      className={cn(textareaClassName, 'min-h-[150px]')}
                      placeholder="Ex.: movimentação de carga, acesso de veículos, piso irregular."
                    />
                    {errors.riscos_operacionais ? (
                      <p className={errorClassName}>{errors.riscos_operacionais.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="did-controles-planejados" className={labelClassName}>
                      Controles planejados
                    </label>
                    <textarea
                      id="did-controles-planejados"
                      {...register('controles_planejados')}
                      className={cn(textareaClassName, 'min-h-[150px]')}
                      placeholder="Ex.: isolamento da área, conferência antes do início, comunicação por rádio."
                    />
                    {errors.controles_planejados ? (
                      <p className={errorClassName}>{errors.controles_planejados.message}</p>
                    ) : null}
                  </div>
                </FormGrid>
              </FormFieldGroup>

              <FormFieldGroup
                tone="default"
                label="Complementos"
                description="Campos extras para reforçar o combinado visual do turno."
                className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] px-4 py-4"
              >
                <FormGrid cols={2}>
                  <div>
                    <label htmlFor="did-epi-epc" className={labelClassName}>
                      EPIs / EPCs aplicáveis
                    </label>
                    <textarea
                      id="did-epi-epc"
                      {...register('epi_epc_aplicaveis')}
                      className={textareaClassName}
                      placeholder="Ex.: capacete, luvas, colete refletivo, cones."
                    />
                  </div>

                  <div>
                    <label htmlFor="did-observacoes" className={labelClassName}>
                      Observações
                    </label>
                    <textarea
                      id="did-observacoes"
                      {...register('observacoes')}
                      className={textareaClassName}
                      placeholder="Registre recados rápidos, alinhamentos complementares ou observações gerais."
                    />
                  </div>
                </FormGrid>
              </FormFieldGroup>
            </div>
          </FormSection>

          <FormSection
            title="Participantes"
            description="A seleção da equipe ficou mais visual para facilitar a conferência do alinhamento."
            icon={<Users className="h-4 w-4" />}
            badge="Etapa 3"
            actions={<StatusPill tone="info">{selectedParticipantIds.length} selecionado(s)</StatusPill>}
            className="border-l-4 border-l-[var(--ds-color-action-primary)]"
          >
            {!selectedCompanyId ? (
              <div className="rounded-[var(--ds-radius-xl)] border border-dashed border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)] px-5 py-8 text-center text-sm text-[var(--ds-color-text-muted)]">
                Selecione uma empresa para listar os participantes.
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-[var(--ds-radius-xl)] border border-dashed border-[var(--ds-color-border-default)] bg-[color:var(--ds-color-surface-muted)] px-5 py-8 text-center text-sm text-[var(--ds-color-text-muted)]">
                Nenhum usuário disponível para a empresa selecionada.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredUsers.map((user) => {
                  const selected = selectedParticipantIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleParticipant(user.id)}
                      aria-label={
                        selected
                          ? `${user.nome}: participante selecionado. Clique para remover da equipe do DID.`
                          : `${user.nome}: participante disponível. Clique para incluir na equipe do DID.`
                      }
                      className={cn(
                        'flex min-h-[86px] items-center justify-between rounded-[var(--ds-radius-lg)] border px-4 py-3 text-left text-sm transition-all duration-[var(--ds-motion-base)]',
                        selected
                          ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-text-primary)] shadow-[var(--component-card-shadow)]'
                          : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-color-border-default)] hover:bg-[var(--ds-color-surface-muted)]',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-full border text-xs font-semibold tracking-[0.08em]',
                            selected
                              ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-action-primary)]'
                              : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]',
                          )}
                        >
                          {getUserInitials(user.nome)}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">{user.nome}</p>
                          <p className="text-xs text-[var(--ds-color-text-muted)]">
                            {selected
                              ? 'Participante incluído na equipe deste DID'
                              : 'Participante disponível para este DID'}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border',
                          selected
                            ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)] text-[var(--ds-color-action-primary-foreground)]'
                            : 'border-[var(--ds-color-border-default)] text-[var(--ds-color-text-muted)]',
                        )}
                      >
                        {selected ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {errors.participants ? (
              <p className={errorClassName}>{errors.participants.message}</p>
            ) : selectedParticipantIds.length === 0 ? (
              <div
                role="alert"
                className="rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-warning)]/22 bg-[color:var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-warning)]"
              >
                <p className="font-semibold">Equipe ainda não definida</p>
                <p className="mt-1 text-[color:var(--ds-color-warning)]/90">
                  Selecione pelo menos um participante para formalizar o DID do turno.
                </p>
              </div>
            ) : null}
          </FormSection>
        </fieldset>

      </FormPageLayout>
    </form>
  );
}
