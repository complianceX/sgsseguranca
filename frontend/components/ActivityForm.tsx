'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { activitiesService } from '@/services/activitiesService';
import { companiesService, Company } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';

const activitySchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  descricao: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type ActivityFormData = z.infer<typeof activitySchema>;

interface ActivityFormProps {
  id?: string;
}

export function ActivityForm({ id }: ActivityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isValid, isSubmitting },
  } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      nome: '',
      descricao: '',
      company_id: '',
    },
  });

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
          // sem permissão para listar empresas — seguir com lista vazia
        }
        setCompanies(companiesData);

        if (id) {
          const data = await activitiesService.findOne(id);
          reset({
            nome: data.nome,
            descricao: data.descricao || '',
            company_id: data.company_id || '',
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados do formulário.');
        if (id) router.push('/dashboard/activities');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router]);

  async function onSubmit(data: ActivityFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      if (id) {
        await activitiesService.update(id, data);
        toast.success('Atividade atualizada com sucesso!');
      } else {
        await activitiesService.create(data);
        toast.success('Atividade cadastrada com sucesso!');
      }
      router.push('/dashboard/activities');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar atividade:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar atividades.',
        server: 'Erro interno do servidor ao salvar atividade.',
        fallback: 'Erro ao salvar atividade. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar atividade. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<ActivityFormData>) => {
    if (formErrors.company_id) {
      setFocus('company_id');
    } else if (formErrors.nome) {
      setFocus('nome');
    }
    toast.error('Revise os campos obrigatórios antes de salvar.');
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="ds-form-page mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/activities"
            className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]"
            title="Voltar"
            aria-label="Voltar para a lista de atividades"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? 'Editar Atividade' : 'Nova Atividade'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-[var(--ds-shadow-sm)]">
        {submitError && (
          <div className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger)]">
            {submitError}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label htmlFor="company_id" className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">Empresa</label>
            <select
              id="company_id"
              {...register('company_id')}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.company_id ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.company_id ? 'true' : undefined}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.razao_social}</option>
              ))}
            </select>
            {errors.company_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.company_id.message}</p>}
          </div>

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">Nome da Atividade</label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm ${
                errors.nome ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.nome ? 'true' : undefined}
              placeholder="Ex: Trabalho em Altura"
            />
            {errors.nome && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.nome.message}</p>}
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">Descrição</label>
            <textarea
              id="descricao"
              {...register('descricao')}
              rows={4}
              className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Descreva brevemente a atividade..."
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 border-t pt-6">
          <Link
            href="/dashboard/activities"
            className="rounded-md border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading || isSubmitting || !isValid}
            className="flex items-center rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50"
          >
            {loading ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar Atividade
          </button>
        </div>
      </form>
    </div>
  );
}
