'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { machinesService } from '@/services/machinesService';
import { companiesService, Company } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getFormErrorMessage } from '@/lib/error-handler';

const machineSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  descricao: z.string().optional(),
  placa: z.string().optional(),
  horimetro_atual: z.number().min(0, 'O horímetro deve ser maior ou igual a zero'),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type MachineFormData = z.infer<typeof machineSchema>;

interface MachineFormProps {
  id?: string;
}

export function MachineForm({ id }: MachineFormProps) {
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
  } = useForm<MachineFormData>({
    resolver: zodResolver(machineSchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      nome: '',
      descricao: '',
      placa: '',
      horimetro_atual: 0,
      company_id: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const companiesData = await companiesService.findAll();
        setCompanies(companiesData);

        if (id) {
          const machineData = await machinesService.findOne(id);
          reset({
            nome: machineData.nome,
            descricao: machineData.descricao || '',
            placa: machineData.placa || '',
            horimetro_atual: machineData.horimetro_atual || 0,
            company_id: machineData.company_id,
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
        router.push('/dashboard/machines');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router]);

  async function onSubmit(data: MachineFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      if (id) {
        await machinesService.update(id, data);
        toast.success('Máquina atualizada com sucesso!');
      } else {
        await machinesService.create(data);
        toast.success('Máquina cadastrada com sucesso!');
      }
      router.push('/dashboard/machines');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar máquina:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar máquinas.',
        server: 'Erro interno do servidor ao salvar máquina.',
        fallback: 'Erro ao salvar máquina. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar máquina. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<MachineFormData>) => {
    if (formErrors.company_id) {
      setFocus('company_id');
    } else if (formErrors.nome) {
      setFocus('nome');
    } else if (formErrors.horimetro_atual) {
      setFocus('horimetro_atual');
    }
    toast.error('Revise os campos obrigatórios antes de salvar.');
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/machines"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Voltar"
            aria-label="Voltar para a lista de máquinas"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? 'Editar Máquina' : 'Nova Máquina'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="company_id" className="text-sm font-medium text-gray-700">
              Empresa
            </label>
            <select
              id="company_id"
              {...register('company_id')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.company_id ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
              aria-invalid={Boolean(errors.company_id)}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.razao_social}
                </option>
              ))}
            </select>
            {errors.company_id && (
              <p className="text-xs text-red-500">{errors.company_id.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="nome" className="text-sm font-medium text-gray-700">
              Nome da Máquina
            </label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.nome ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
              aria-invalid={Boolean(errors.nome)}
              placeholder="Ex: Escavadeira Caterpillar"
            />
            {errors.nome && (
              <p className="text-xs text-red-500">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="placa" className="text-sm font-medium text-gray-700">
              Placa / Identificação
            </label>
            <input
              id="placa"
              type="text"
              {...register('placa')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ex: ABC-1234"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="horimetro_atual" className="text-sm font-medium text-gray-700">
              Horímetro Atual
            </label>
            <input
              id="horimetro_atual"
              type="number"
              step="0.1"
              {...register('horimetro_atual', { valueAsNumber: true })}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                errors.horimetro_atual ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
              aria-invalid={Boolean(errors.horimetro_atual)}
            />
            {errors.horimetro_atual && (
              <p className="text-xs text-red-500">{errors.horimetro_atual.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="descricao" className="text-sm font-medium text-gray-700">
              Descrição
            </label>
            <textarea
              id="descricao"
              rows={3}
              {...register('descricao')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Link
            href="/dashboard/machines"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading || isSubmitting || !isValid}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {id ? 'Salvar Alterações' : 'Criar Máquina'}
          </button>
        </div>
      </form>
    </div>
  );
}
