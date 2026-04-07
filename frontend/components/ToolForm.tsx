'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toolsService } from '@/services/toolsService';
import { companiesService, Company } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';

const toolSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  descricao: z.string().optional(),
  numero_serie: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type ToolFormData = z.infer<typeof toolSchema>;

interface ToolFormProps {
  id?: string;
}

export function ToolForm({ id }: ToolFormProps) {
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
  } = useForm<ToolFormData>({
    resolver: zodResolver(toolSchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      nome: '',
      descricao: '',
      numero_serie: '',
      company_id: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const companiesPage = await companiesService.findPaginated({
          page: 1,
          limit: 200,
        });
        const companiesData = companiesPage.data;
        setCompanies(companiesData);
        if (companiesPage.lastPage > 1) {
          toast.warning(
            'A lista de empresas foi limitada aos primeiros 200 registros.',
          );
        }

        if (id) {
          const toolData = await toolsService.findOne(id);
          reset({
            nome: toolData.nome,
            descricao: toolData.descricao || '',
            numero_serie: toolData.numero_serie || '',
            company_id: toolData.company_id,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
        router.push('/dashboard/tools');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router]);

  async function onSubmit(data: ToolFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      if (id) {
        await toolsService.update(id, data);
        toast.success('Ferramenta atualizada com sucesso!');
      } else {
        await toolsService.create(data);
        toast.success('Ferramenta cadastrada com sucesso!');
      }
      router.push('/dashboard/tools');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar ferramenta:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar ferramentas.',
        server: 'Erro interno do servidor ao salvar ferramenta.',
        fallback: 'Erro ao salvar ferramenta. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar ferramenta. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<ToolFormData>) => {
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
            href="/dashboard/tools"
            className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]"
            title="Voltar"
            aria-label="Voltar para a lista de ferramentas"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? 'Editar Ferramenta' : 'Nova Ferramenta'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-[var(--ds-shadow-sm)]">
        {submitError && (
          <div className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger)]">
            {submitError}
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="company_id" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Empresa
            </label>
            <select
              id="company_id"
              {...register('company_id')}
              className={`w-full rounded-md border bg-[var(--ds-color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] placeholder:text-[var(--ds-color-text-secondary)] focus:bg-[var(--ds-color-surface-base)] focus:outline-none ${errors.company_id ? 'border-[var(--ds-color-danger)]' : 'border-[var(--ds-color-border-strong)] focus:border-[var(--ds-color-action-primary)]'
                }`}
              aria-invalid={errors.company_id ? 'true' : undefined}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.razao_social}
                </option>
              ))}
            </select>
            {errors.company_id && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.company_id.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="nome" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Nome da Ferramenta
            </label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className={`w-full rounded-md border bg-[var(--ds-color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] placeholder:text-[var(--ds-color-text-secondary)] focus:bg-[var(--ds-color-surface-base)] focus:outline-none ${errors.nome ? 'border-[var(--ds-color-danger)]' : 'border-[var(--ds-color-border-strong)] focus:border-[var(--ds-color-action-primary)]'
                }`}
              aria-invalid={errors.nome ? 'true' : undefined}
              placeholder="Ex: Furadeira Bosch"
            />
            {errors.nome && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="numero_serie" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Número de Série
            </label>
            <input
              id="numero_serie"
              type="text"
              {...register('numero_serie')}
              className="w-full rounded-md border border-[var(--ds-color-border-strong)] bg-[var(--ds-color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] placeholder:text-[var(--ds-color-text-secondary)] focus:border-[var(--ds-color-action-primary)] focus:bg-[var(--ds-color-surface-base)] focus:outline-none"
              placeholder="Ex: SN123456"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="descricao" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Descrição
            </label>
            <textarea
              id="descricao"
              rows={3}
              {...register('descricao')}
              className="w-full rounded-md border border-[var(--ds-color-border-strong)] bg-[var(--ds-color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] placeholder:text-[var(--ds-color-text-secondary)] focus:border-[var(--ds-color-action-primary)] focus:bg-[var(--ds-color-surface-base)] focus:outline-none"
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Link
            href="/dashboard/tools"
            className="rounded-lg border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading || isSubmitting || !isValid}
            className="flex items-center rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50"
          >
            {loading ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {id ? 'Salvar Alterações' : 'Criar Ferramenta'}
          </button>
        </div>
      </form>
    </div>
  );
}
