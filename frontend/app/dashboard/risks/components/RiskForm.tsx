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
  probability: z.coerce.number().min(1).max(5).optional(),
  severity: z.coerce.number().min(1).max(5).optional(),
  exposure: z.coerce.number().min(1).max(5).optional(),
  residual_risk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  control_hierarchy: z
    .enum(['ELIMINATION', 'SUBSTITUTION', 'ENGINEERING', 'ADMINISTRATIVE', 'PPE'])
    .optional(),
  evidence_photo: z.string().optional(),
  evidence_document: z.string().optional(),
  control_description: z.string().optional(),
  control_evidence: z.boolean().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
});

type RiskFormInput = z.input<typeof riskSchema>;
type RiskFormData = z.output<typeof riskSchema>;

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
  } = useForm<RiskFormInput, unknown, RiskFormData>({
    resolver: zodResolver(riskSchema),
    defaultValues: {
      nome: '',
      categoria: '',
      descricao: '',
      medidas_controle: '',
      probability: undefined,
      severity: undefined,
      exposure: undefined,
      residual_risk: undefined,
      control_hierarchy: undefined,
      evidence_photo: '',
      evidence_document: '',
      control_description: '',
      control_evidence: false,
      company_id: '',
    },
  });

  useEffect(() => {
    async function loadData() {
      try {
        let selectedCompanyId = '';

        if (id) {
          const data = await risksService.findOne(id);
          selectedCompanyId = data.company_id || '';
          reset({
            nome: data.nome,
            categoria: data.categoria || '',
            descricao: data.descricao || '',
            medidas_controle: data.medidas_controle || '',
            probability: data.probability || undefined,
            severity: data.severity || undefined,
            exposure: data.exposure || undefined,
            residual_risk: data.residual_risk || undefined,
            control_hierarchy: data.control_hierarchy || undefined,
            evidence_photo: data.evidence_photo || '',
            evidence_document: data.evidence_document || '',
            control_description: data.control_description || '',
            control_evidence: Boolean(data.control_evidence),
            company_id: data.company_id || '',
          });
        }

        let nextCompanies: Company[] = [];
        try {
          const companiesPage = await companiesService.findPaginated({
            page: 1,
            limit: 100,
          });
          nextCompanies = companiesPage.data;
        } catch {
          // sem permissão para listar todas as empresas
        }

        if (
          selectedCompanyId &&
          !nextCompanies.some((company) => company.id === selectedCompanyId)
        ) {
          try {
            const selectedCompany = await companiesService.findOne(selectedCompanyId);
            nextCompanies = [selectedCompany, ...nextCompanies];
          } catch {}
        }

        setCompanies(
          Array.from(new Map(nextCompanies.map((company) => [company.id, company])).values()),
        );
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
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-800 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="ds-form-page mx-auto max-w-2xl space-y-6">
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
              aria-invalid={errors.company_id ? 'true' : undefined}
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
              aria-invalid={errors.nome ? 'true' : undefined}
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
              aria-invalid={errors.categoria ? 'true' : undefined}
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
              aria-label="Descrição do risco"
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
              aria-label="Medidas de controle"
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="Informe as medidas de controle adotadas..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="probability" className="block text-sm font-medium text-gray-700">Probabilidade (1-5)</label>
              <input
                id="probability"
                type="number"
                min={1}
                max={5}
                {...register('probability', { valueAsNumber: true })}
                aria-label="Probabilidade"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="severity" className="block text-sm font-medium text-gray-700">Severidade (1-5)</label>
              <input
                id="severity"
                type="number"
                min={1}
                max={5}
                {...register('severity', { valueAsNumber: true })}
                aria-label="Severidade"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="exposure" className="block text-sm font-medium text-gray-700">Exposição (1-5)</label>
              <input
                id="exposure"
                type="number"
                min={1}
                max={5}
                {...register('exposure', { valueAsNumber: true })}
                aria-label="Exposição"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="residual_risk" className="block text-sm font-medium text-gray-700">Risco Residual</label>
              <select
                id="residual_risk"
                {...register('residual_risk')}
                aria-label="Risco residual"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              >
                <option value="">Automático</option>
                <option value="LOW">Baixo</option>
                <option value="MEDIUM">Médio</option>
                <option value="HIGH">Alto</option>
                <option value="CRITICAL">Crítico</option>
              </select>
            </div>
            <div>
              <label htmlFor="control_hierarchy" className="block text-sm font-medium text-gray-700">Hierarquia de Controle</label>
              <select
                id="control_hierarchy"
                {...register('control_hierarchy')}
                aria-label="Hierarquia de controle"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
              >
                <option value="">Selecione</option>
                <option value="ELIMINATION">Eliminação</option>
                <option value="SUBSTITUTION">Substituição</option>
                <option value="ENGINEERING">Engenharia</option>
                <option value="ADMINISTRATIVE">Administrativo</option>
                <option value="PPE">EPI</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="control_description" className="block text-sm font-medium text-gray-700">Descrição do Controle</label>
            <textarea
              id="control_description"
              {...register('control_description')}
              aria-label="Descrição do controle"
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="evidence_photo" className="block text-sm font-medium text-gray-700">Evidência (foto/url)</label>
              <input
              id="evidence_photo"
              type="text"
              {...register('evidence_photo')}
              aria-label="Evidência em foto ou URL"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
            />
            </div>
            <div>
              <label htmlFor="evidence_document" className="block text-sm font-medium text-gray-700">Evidência documental</label>
              <input
              id="evidence_document"
              type="text"
              {...register('evidence_document')}
              aria-label="Evidência documental"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none transition-colors"
            />
            </div>
          </div>

          <label htmlFor="control_evidence" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
            <input id="control_evidence" type="checkbox" {...register('control_evidence')} className="h-4 w-4 rounded border-gray-300" />
            Controle com evidência validada
          </label>
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
