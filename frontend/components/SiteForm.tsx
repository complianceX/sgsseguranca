'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sitesService } from '@/services/sitesService';
import { companiesService, Company } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';

const siteSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type SiteFormData = z.infer<typeof siteSchema>;

interface SiteFormProps {
  id?: string;
}

export function SiteForm({ id }: SiteFormProps) {
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
  } = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      nome: '',
      endereco: '',
      cidade: '',
      estado: '',
      company_id: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const companiesData = await companiesService.findAll();
        setCompanies(companiesData);

        if (id) {
          const siteData = await sitesService.findOne(id);
          reset({
            nome: siteData.nome,
            endereco: siteData.endereco || '',
            cidade: siteData.cidade || '',
            estado: siteData.estado || '',
            company_id: siteData.company_id,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
        router.push('/dashboard/sites');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router]);

  async function onSubmit(data: SiteFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      if (id) {
        await sitesService.update(id, data);
        toast.success('Obra/Setor atualizado com sucesso!');
      } else {
        await sitesService.create(data);
        toast.success('Obra/Setor cadastrado com sucesso!');
      }
      router.push('/dashboard/sites');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar obra/setor:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar obras/setores.',
        server: 'Erro interno do servidor ao salvar obra/setor.',
        fallback: 'Erro ao salvar obra/setor. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar obra/setor. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<SiteFormData>) => {
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
            href="/dashboard/sites"
            className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]"
            title="Voltar"
            aria-label="Voltar para a lista de obras/setores"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? 'Editar Obra/Setor' : 'Nova Obra/Setor'}
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
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.company_id ? 'border-[var(--ds-color-danger)]' : 'border-[var(--ds-color-border-default)]'
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
              Nome da Obra/Setor
            </label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.nome ? 'border-[var(--ds-color-danger)]' : 'border-[var(--ds-color-border-default)]'
              }`}
              aria-invalid={errors.nome ? 'true' : undefined}
              placeholder="Ex: Obra Centro"
            />
            {errors.nome && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="endereco" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Endereço
            </label>
            <input
              id="endereco"
              type="text"
              {...register('endereco')}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Rua, Número, Bairro"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="cidade" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Cidade
            </label>
            <input
              id="cidade"
              type="text"
              {...register('cidade')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="estado" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Estado (UF)
            </label>
            <input
              id="estado"
              type="text"
              maxLength={2}
              {...register('estado')}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Ex: MG"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Link
            href="/dashboard/sites"
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
            {id ? 'Salvar Alterações' : 'Criar Obra/Setor'}
          </button>
        </div>
      </form>
    </div>
  );
}
