'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { companiesService, type Company } from '@/services/companiesService';
import {
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
  'mt-1 block w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-action-primary)] focus:outline-none';

const textareaClassName = `${inputClassName} min-h-[120px]`;

function getInitialCompanyId() {
  const selectedTenantCompanyId = selectedTenantStore.get()?.companyId || null;
  const sessionCompanyId = sessionStore.get()?.companyId || null;
  return selectedTenantCompanyId || sessionCompanyId || '';
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
  const selectedParticipantIds = watch('participants') || [];

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

  useEffect(() => {
    async function loadData() {
      try {
        const [companiesData, sitesData, usersData] = await Promise.all([
          companiesService.findAll(),
          sitesService.findAll(),
          usersService.findAll(),
        ]);

        setCompanies(companiesData);
        setSites(sitesData);
        setUsers(usersData);

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
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ds-color-action-primary)]" />
      </div>
    );
  }

  if (!canManageDids) {
    return (
      <div className="rounded-lg border border-[color:var(--ds-color-danger)]/20 bg-[color:var(--ds-color-danger)]/8 px-5 py-4 text-sm text-[var(--ds-color-danger)]">
        Voce nao tem permissao para criar ou editar Dialogos do Inicio do Dia.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/dids"
          className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-surface-muted)] hover:text-[var(--ds-color-text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? 'Editar Diálogo do Início do Dia' : 'Novo Diálogo do Início do Dia'}
          </h1>
          <p className="text-sm text-[var(--ds-color-text-muted)]">
            Registro operacional da atividade programada para o dia.
          </p>
        </div>
      </div>

      {readOnlyMessage ? (
        <div className="rounded-xl border border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning-subtle)] px-5 py-4 text-sm text-[var(--ds-color-text-secondary)]">
          <p className="font-semibold text-[var(--ds-color-text-primary)]">
            Documento travado para edicao
          </p>
          <p className="mt-1">{readOnlyMessage}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isReadOnly || saving || isSubmitting} className="space-y-6">
          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--ds-color-text-primary)]">
              Contexto do dia
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="did-titulo" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Titulo
                </label>
                <input id="did-titulo" type="text" {...register('titulo')} className={inputClassName} />
                {errors.titulo ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.titulo.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-data" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Data
                </label>
                <input id="did-data" type="date" {...register('data')} className={inputClassName} />
                {errors.data ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.data.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-turno" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Turno
                </label>
                <select id="did-turno" {...register('turno')} className={inputClassName}>
                  <option value="">Selecione</option>
                  <option value="manha">Manha</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                  <option value="integral">Integral</option>
                </select>
              </div>

              <div>
                <label htmlFor="did-company" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
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
                {errors.company_id ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.company_id.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-site" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Site / frente
                </label>
                <select id="did-site" {...register('site_id')} className={inputClassName} disabled={!selectedCompanyId}>
                  <option value="">{selectedCompanyId ? 'Selecione o site' : 'Selecione uma empresa primeiro'}</option>
                  {filteredSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
                {errors.site_id ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.site_id.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-responsavel" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Responsavel
                </label>
                <select
                  id="did-responsavel"
                  {...register('responsavel_id')}
                  className={inputClassName}
                  disabled={!selectedCompanyId}
                >
                  <option value="">{selectedCompanyId ? 'Selecione o responsavel' : 'Selecione uma empresa primeiro'}</option>
                  {filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                    </option>
                  ))}
                </select>
                {errors.responsavel_id ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.responsavel_id.message}</p> : null}
              </div>

              <div className="md:col-span-2">
                <label htmlFor="did-frente" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Frente de trabalho
                </label>
                <input id="did-frente" type="text" {...register('frente_trabalho')} className={inputClassName} />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="did-descricao" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Descricao e objetivo do alinhamento
                </label>
                <textarea id="did-descricao" {...register('descricao')} className={textareaClassName} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--ds-color-text-primary)]">
              Conteudo operacional
            </h2>
            <div className="grid grid-cols-1 gap-5">
              <div>
                <label htmlFor="did-atividade-principal" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Atividade principal
                </label>
                <input id="did-atividade-principal" type="text" {...register('atividade_principal')} className={inputClassName} />
                {errors.atividade_principal ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.atividade_principal.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-atividades-planejadas" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Atividades planejadas
                </label>
                <textarea id="did-atividades-planejadas" {...register('atividades_planejadas')} className={textareaClassName} />
                {errors.atividades_planejadas ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.atividades_planejadas.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-riscos-operacionais" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Riscos operacionais
                </label>
                <textarea id="did-riscos-operacionais" {...register('riscos_operacionais')} className={textareaClassName} />
                {errors.riscos_operacionais ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.riscos_operacionais.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-controles-planejados" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Controles planejados
                </label>
                <textarea id="did-controles-planejados" {...register('controles_planejados')} className={textareaClassName} />
                {errors.controles_planejados ? <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.controles_planejados.message}</p> : null}
              </div>

              <div>
                <label htmlFor="did-epi-epc" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  EPIs / EPCs aplicaveis
                </label>
                <textarea id="did-epi-epc" {...register('epi_epc_aplicaveis')} className={textareaClassName} />
              </div>

              <div>
                <label htmlFor="did-observacoes" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Observacoes
                </label>
                <textarea id="did-observacoes" {...register('observacoes')} className={textareaClassName} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                Participantes
              </h2>
              <span className="text-xs text-[var(--ds-color-text-muted)]">
                {selectedParticipantIds.length} selecionado(s)
              </span>
            </div>

            {!selectedCompanyId ? (
              <div className="rounded-lg border border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] py-6 text-center text-sm text-[var(--ds-color-text-muted)]">
                Selecione uma empresa para listar os participantes.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {filteredUsers.map((user) => {
                  const selected = selectedParticipantIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleParticipant(user.id)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                        selected
                          ? 'border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-action-primary)]/8 text-[var(--ds-color-action-primary)]'
                          : 'border-[var(--ds-color-border-subtle)] hover:bg-[var(--ds-color-surface-muted)]'
                      }`}
                    >
                      <span>{user.nome}</span>
                      {selected ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ds-color-action-primary)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}

            {errors.participants ? (
              <p className="mt-2 text-xs text-[var(--ds-color-danger)]">
                {errors.participants.message}
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard/dids')}
            className="rounded-lg border border-[var(--ds-color-border-default)] px-5 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isReadOnly || saving || isSubmitting || !isValid}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--ds-color-action-primary)] px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving || isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{id ? 'Salvar alteracoes' : 'Salvar documento'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
