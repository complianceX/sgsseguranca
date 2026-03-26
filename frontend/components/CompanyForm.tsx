'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { companiesService } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';

const companySchema = z.object({
  razao_social: z.string().min(3, 'A razão social deve ter pelo menos 3 caracteres'),
  cnpj: z.string().min(14, 'CNPJ inválido'),
  endereco: z.string().min(5, 'O endereço deve ter pelo menos 5 caracteres'),
  responsavel: z.string().min(3, 'O responsável deve ter pelo menos 3 caracteres'),
  status: z.boolean(),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanyFormProps {
  id?: string;
}

export function CompanyForm({ id }: CompanyFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      razao_social: '',
      cnpj: '',
      endereco: '',
      responsavel: '',
      status: true,
    },
  });

  useEffect(() => {
    async function loadCompany() {
      try {
        const data = await companiesService.findOne(id!);
        reset({
          razao_social: data.razao_social,
          cnpj: data.cnpj,
          endereco: data.endereco,
          responsavel: data.responsavel,
          status: data.status,
        });
      } catch (error) {
        console.error('Erro ao carregar empresa:', error);
        toast.error('Erro ao carregar dados da empresa.');
        router.push('/dashboard/companies');
      } finally {
        setFetching(false);
      }
    }

    if (id) {
      loadCompany();
    }
  }, [id, reset, router]);

  async function onSubmit(data: CompanyFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      if (id) {
        await companiesService.update(id, data);
        toast.success('Empresa atualizada com sucesso!');
      } else {
        await companiesService.create(data);
        toast.success('Empresa cadastrada com sucesso!');
      }
      router.push('/dashboard/companies');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar empresas.',
        server: 'Erro interno do servidor ao salvar empresa.',
        fallback: 'Erro ao salvar empresa. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar empresa. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<CompanyFormData>) => {
    if (formErrors.razao_social) {
      setFocus('razao_social');
    } else if (formErrors.cnpj) {
      setFocus('cnpj');
    } else if (formErrors.endereco) {
      setFocus('endereco');
    } else if (formErrors.responsavel) {
      setFocus('responsavel');
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
            href="/dashboard/companies"
            className="rounded-full p-2 text-[var(--ds-color-text-muted)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-text-primary)]"
            title="Voltar"
            aria-label="Voltar para a lista de empresas"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {id ? 'Editar Empresa' : 'Nova Empresa'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        {submitError && (
          <div className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger)]">
            {submitError}
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="razao_social" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Razão Social
            </label>
            <input
              id="razao_social"
              type="text"
              {...register('razao_social')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.razao_social ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.razao_social ? 'true' : undefined}
              placeholder="Ex: Empresa de Engenharia LTDA"
            />
            {errors.razao_social && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.razao_social.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="cnpj" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              CNPJ
            </label>
            <input
              id="cnpj"
              type="text"
              {...register('cnpj')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.cnpj ? 'border-[var(--ds-color-danger)]' : ''
              }`}
              aria-invalid={errors.cnpj ? 'true' : undefined}
              placeholder="00.000.000/0000-00"
            />
            {errors.cnpj && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.cnpj.message}</p>
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
              placeholder="Rua, Número, Bairro, Cidade - UF"
            />
            {errors.endereco && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.endereco.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="responsavel" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Responsável
            </label>
            <input
              id="responsavel"
              type="text"
              {...register('responsavel')}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Nome do responsável"
            />
            {errors.responsavel && (
              <p className="text-xs text-[var(--ds-color-danger)]">{errors.responsavel.message}</p>
            )}
          </div>

          <div className="flex items-center space-x-2 pt-8">
            <input
              id="status"
              type="checkbox"
              {...register('status')}
              className="h-4 w-4 rounded border-[var(--ds-color-border-default)] accent-[var(--ds-color-action-primary)]"
            />
            <label htmlFor="status" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Ativo
            </label>
          </div>
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Link
            href="/dashboard/companies"
            className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]"
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
            {id ? 'Salvar Alterações' : 'Criar Empresa'}
          </button>
        </div>
      </form>
    </div>
  );
}
