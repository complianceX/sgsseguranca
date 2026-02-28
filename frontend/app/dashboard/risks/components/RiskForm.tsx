'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { risksService } from '@/services/risksService';
import { companiesService, Company } from '@/services/companiesService';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { Button } from '@/components/ui/button';

const riskSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  categoria: z.string().min(1, 'Selecione uma categoria'),
  descricao: z.string().optional(),
  medidas_controle: z.string().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type RiskFormData = z.infer<typeof riskSchema>;

interface RiskFormProps {
  id?: string;
}

export function RiskForm({ id }: RiskFormProps) {
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RiskFormData>({
    resolver: zodResolver(riskSchema),
    defaultValues: {
      nome: '',
      categoria: '',
      descricao: '',
      medidas_controle: '',
      company_id: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        const companiesData = await companiesService.findAll();
        setCompanies(companiesData);

        if (id) {
          const data = await risksService.findOne(id);
          reset({
            nome: data.nome,
            categoria: data.categoria || '',
            descricao: data.descricao || '',
            medidas_controle: data.medidas_controle || '',
            company_id: data.company_id || '',
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados do formulário.');
        if (id) router.push('/dashboard/risks');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router]);

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: RiskFormData) => {
      if (id) {
        await risksService.update(id, data);
      } else {
        await risksService.create(data);
      }
    },
    {
      successMessage: id ? 'Risco atualizado com sucesso!' : 'Risco cadastrado com sucesso!',
      redirectTo: '/dashboard/risks',
      context: 'Risco',
    }
  );

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
            href="/dashboard/risks"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-gray-50"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? 'Editar Risco' : 'Novo Risco'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <label htmlFor="company_id" className="block text-sm font-medium text-gray-700">Empresa</label>
            <select
              id="company_id"
              {...register('company_id')}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none transition-colors ${
                errors.company_id ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.razao_social}</option>
              ))}
            </select>
            {errors.company_id && <p className="mt-1 text-xs text-red-500">{errors.company_id.message}</p>}
          </div>

          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome do Risco</label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none transition-colors ${
                errors.nome ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
              placeholder="Ex: Queda de mesmo nível"
            />
            {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome.message}</p>}
          </div>

          <div>
            <label htmlFor="categoria" className="block text-sm font-medium text-gray-700">Categoria</label>
            <select
              id="categoria"
              {...register('categoria')}
              className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none transition-colors ${
                errors.categoria ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
              }`}
            >
              <option value="">Selecione uma categoria</option>
              <option value="Físico">Físico</option>
              <option value="Químico">Químico</option>
              <option value="Biológico">Biológico</option>
              <option value="Ergonômico">Ergonômico</option>
              <option value="Acidente">Acidente</option>
            </select>
            {errors.categoria && <p className="mt-1 text-xs text-red-500">{errors.categoria.message}</p>}
          </div>

          <div>
            <label htmlFor="descricao" className="block text-sm font-medium text-gray-700">Descrição</label>
            <textarea
              id="descricao"
              {...register('descricao')}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Descreva brevemente o risco..."
            />
          </div>

          <div>
            <label htmlFor="medidas_controle" className="block text-sm font-medium text-gray-700">Medidas de Controle</label>
            <textarea
              id="medidas_controle"
              {...register('medidas_controle')}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Informe as medidas de controle adotadas..."
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 border-t pt-6">
          <Link
            href="/dashboard/risks"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <Button
            type="submit"
            loading={loading}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Salvar Risco
          </Button>
        </div>
      </form>
    </div>
  );
}
