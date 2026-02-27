'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { nonConformitiesService } from '@/services/nonConformitiesService';
import { sitesService, Site } from '@/services/sitesService';
import { getFormErrorMessage } from '@/lib/error-handler';
import { attachPdfIfProvided } from '@/lib/document-upload';

const nonConformitySchema = z.object({
  codigo_nc: z.string().min(1, 'O código é obrigatório'),
  tipo: z.string().min(1, 'O tipo é obrigatório'),
  data_identificacao: z.string(),
  site_id: z.string().optional(),
  local_setor_area: z.string().min(1, 'O local/setor/área é obrigatório'),
  atividade_envolvida: z.string().min(1, 'A atividade é obrigatória'),
  responsavel_area: z.string().min(1, 'O responsável é obrigatório'),
  auditor_responsavel: z.string().min(1, 'O auditor é obrigatório'),
  classificacao: z.array(z.string()).optional(),
  descricao: z.string().min(1, 'A descrição é obrigatória'),
  evidencia_observada: z.string().min(1, 'A evidência é obrigatória'),
  condicao_insegura: z.string().min(1, 'A condição insegura é obrigatória'),
  ato_inseguro: z.string().optional(),
  requisito_nr: z.string().min(1, 'A NR é obrigatória'),
  requisito_item: z.string().min(1, 'O item é obrigatório'),
  requisito_procedimento: z.string().optional(),
  requisito_politica: z.string().optional(),
  risco_perigo: z.string().min(1, 'O perigo é obrigatório'),
  risco_associado: z.string().min(1, 'O risco é obrigatório'),
  risco_consequencias: z.array(z.string()).optional(),
  risco_nivel: z.string().min(1, 'O nível de risco é obrigatório'),
  causa: z.array(z.string()).optional(),
  causa_outro: z.string().optional(),
  acao_imediata_descricao: z.string().optional(),
  acao_imediata_data: z.string().optional(),
  acao_imediata_responsavel: z.string().optional(),
  acao_imediata_status: z.string().optional(),
  acao_definitiva_descricao: z.string().optional(),
  acao_definitiva_prazo: z.string().optional(),
  acao_definitiva_responsavel: z.string().optional(),
  acao_definitiva_recursos: z.string().optional(),
  acao_definitiva_data_prevista: z.string().optional(),
  acao_preventiva_medidas: z.string().optional(),
  acao_preventiva_treinamento: z.string().optional(),
  acao_preventiva_revisao_procedimento: z.string().optional(),
  acao_preventiva_melhoria_processo: z.string().optional(),
  acao_preventiva_epc_epi: z.string().optional(),
  verificacao_resultado: z.string().optional(),
  verificacao_evidencias: z.string().optional(),
  verificacao_data: z.string().optional(),
  verificacao_responsavel: z.string().optional(),
  status: z.string().min(1, 'O status é obrigatório'),
  observacoes_gerais: z.string().optional(),
  anexos: z.array(z.object({ url: z.string().min(1, 'Informe o anexo') })).optional(),
  assinatura_responsavel_area: z.string().optional(),
  assinatura_tecnico_auditor: z.string().optional(),
  assinatura_gestao: z.string().optional(),
});

type NonConformityFormData = z.infer<typeof nonConformitySchema>;

interface NonConformityFormProps {
  id?: string;
}

export function NonConformityForm({ id }: NonConformityFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    formState: { errors, isValid, isSubmitting },
  } = useForm<NonConformityFormData>({
    resolver: zodResolver(nonConformitySchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      data_identificacao: new Date().toISOString().split('T')[0],
      tipo: 'Menor',
      risco_nivel: 'Baixo',
      status: 'Aberta',
      acao_imediata_status: 'Não implementada',
      verificacao_resultado: 'Não',
      classificacao: [],
      risco_consequencias: [],
      causa: [],
      anexos: [],
    },
  });

  const { fields: anexosFields, append: appendAnexo, remove: removeAnexo } = useFieldArray({
    control,
    name: 'anexos',
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const sitesData = await sitesService.findAll();
        setSites(sitesData);
        if (id) {
          const nonConformity = await nonConformitiesService.findOne(id);
          reset({
            ...nonConformity,
            data_identificacao: new Date(nonConformity.data_identificacao).toISOString().split('T')[0],
            acao_imediata_data: nonConformity.acao_imediata_data
              ? new Date(nonConformity.acao_imediata_data).toISOString().split('T')[0]
              : undefined,
            acao_definitiva_prazo: nonConformity.acao_definitiva_prazo
              ? new Date(nonConformity.acao_definitiva_prazo).toISOString().split('T')[0]
              : undefined,
            acao_definitiva_data_prevista: nonConformity.acao_definitiva_data_prevista
              ? new Date(nonConformity.acao_definitiva_data_prevista).toISOString().split('T')[0]
              : undefined,
            verificacao_data: nonConformity.verificacao_data
              ? new Date(nonConformity.verificacao_data).toISOString().split('T')[0]
              : undefined,
            anexos: (nonConformity.anexos || []).map((url) => ({ url })),
          });
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setFetching(false);
      }
    };

    loadData();
  }, [id, reset]);

  const onSubmit = async (data: NonConformityFormData) => {
    setLoading(true);
    setSubmitError(null);
    try {
      const payload = {
        ...data,
        anexos: data.anexos?.map((item) => item.url),
      };

      if (id) {
        const updated = await nonConformitiesService.update(id, payload);
        await attachPdfIfProvided(updated.id, pdfFile, nonConformitiesService.attachFile);
        toast.success('Não conformidade atualizada com sucesso');
      } else {
        const created = await nonConformitiesService.create(payload);
        await attachPdfIfProvided(created.id, pdfFile, nonConformitiesService.attachFile);
        toast.success('Não conformidade criada com sucesso');
      }
      router.push('/dashboard/nonconformities');
    } catch (error) {
      console.error('Error saving non conformity:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar esta não conformidade.',
        server: 'Erro interno do servidor ao salvar a não conformidade.',
        fallback: 'Falha ao salvar não conformidade. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar não conformidade');
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (formErrors: FieldErrors<NonConformityFormData>) => {
    if (formErrors.codigo_nc) {
      setFocus('codigo_nc');
    } else if (formErrors.tipo) {
      setFocus('tipo');
    } else if (formErrors.local_setor_area) {
      setFocus('local_setor_area');
    } else if (formErrors.atividade_envolvida) {
      setFocus('atividade_envolvida');
    } else if (formErrors.responsavel_area) {
      setFocus('responsavel_area');
    } else if (formErrors.auditor_responsavel) {
      setFocus('auditor_responsavel');
    } else if (formErrors.descricao) {
      setFocus('descricao');
    } else if (formErrors.evidencia_observada) {
      setFocus('evidencia_observada');
    } else if (formErrors.condicao_insegura) {
      setFocus('condicao_insegura');
    } else if (formErrors.requisito_nr) {
      setFocus('requisito_nr');
    } else if (formErrors.requisito_item) {
      setFocus('requisito_item');
    } else if (formErrors.risco_perigo) {
      setFocus('risco_perigo');
    } else if (formErrors.risco_associado) {
      setFocus('risco_associado');
    } else if (formErrors.risco_nivel) {
      setFocus('risco_nivel');
    }
    toast.error('Revise os campos obrigatórios antes de salvar.');
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const classificacaoOptions = [
    'Legal',
    'Procedimental',
    'Operacional',
    'Documental',
    'Comportamental',
    'Estrutural',
    'Equipamento / Máquina',
    'EPI / EPC',
  ];

  const consequenciasOptions = [
    'Lesão leve',
    'Lesão grave',
    'Incapacidade',
    'Fatalidade',
  ];

  const causasOptions = [
    'Falta de treinamento',
    'Falha de gestão',
    'Falta de procedimento',
    'Descumprimento de procedimento',
    'Falta de manutenção',
    'Falta de fiscalização',
    'Cultura de segurança inadequada',
    'Outro',
  ];

  const tiposNc = ['Crítica', 'Maior', 'Menor'];
  const niveisRisco = ['Baixo', 'Médio', 'Alto', 'Crítico'];
  const statusOptions = ['Aberta', 'Em tratamento', 'Encerrada', 'Reaberta'];
  const statusAcao = ['Implementada', 'Em andamento', 'Não implementada'];
  const resultadoEficacia = ['Sim', 'Parcialmente', 'Não'];

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8 pb-12">
      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">1. Identificação da Não Conformidade</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Código da NC</label>
            <input
              {...register('codigo_nc')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.codigo_nc ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.codigo_nc)}
            />
            {errors.codigo_nc && <p className="mt-1 text-xs text-red-500">{errors.codigo_nc.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Tipo</label>
            <select
              {...register('tipo')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.tipo ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.tipo)}
            >
              {tiposNc.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
            {errors.tipo && <p className="mt-1 text-xs text-red-500">{errors.tipo.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Data da identificação</label>
            <input
              type="date"
              {...register('data_identificacao')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Site / Unidade</label>
            <select
              {...register('site_id')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione o site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Local / Setor / Área</label>
            <input
              {...register('local_setor_area')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.local_setor_area ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.local_setor_area)}
            />
            {errors.local_setor_area && <p className="mt-1 text-xs text-red-500">{errors.local_setor_area.message}</p>}
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Atividade envolvida</label>
            <input
              {...register('atividade_envolvida')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.atividade_envolvida ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.atividade_envolvida)}
            />
            {errors.atividade_envolvida && <p className="mt-1 text-xs text-red-500">{errors.atividade_envolvida.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Responsável pela área</label>
            <input
              {...register('responsavel_area')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.responsavel_area ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.responsavel_area)}
            />
            {errors.responsavel_area && <p className="mt-1 text-xs text-red-500">{errors.responsavel_area.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Auditor / Técnico / Inspetor</label>
            <input
              {...register('auditor_responsavel')}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.auditor_responsavel ? 'border-red-500' : 'border-gray-300'
              }`}
              aria-invalid={Boolean(errors.auditor_responsavel)}
            />
            {errors.auditor_responsavel && <p className="mt-1 text-xs text-red-500">{errors.auditor_responsavel.message}</p>}
          </div>
          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-bold text-gray-700">Anexar PDF da NC (opcional)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">2. Classificação da Não Conformidade</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {classificacaoOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register('classificacao')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">3. Descrição da Não Conformidade</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Descrição</label>
            <textarea
              {...register('descricao')}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.descricao && <p className="mt-1 text-xs text-red-500">{errors.descricao.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Evidência observada</label>
            <textarea
              {...register('evidencia_observada')}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.evidencia_observada && <p className="mt-1 text-xs text-red-500">{errors.evidencia_observada.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Condição insegura identificada</label>
            <textarea
              {...register('condicao_insegura')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.condicao_insegura && <p className="mt-1 text-xs text-red-500">{errors.condicao_insegura.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Ato inseguro</label>
            <textarea
              {...register('ato_inseguro')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">4. Requisito Não Atendido</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Norma Regulamentadora</label>
            <input
              {...register('requisito_nr')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.requisito_nr && <p className="mt-1 text-xs text-red-500">{errors.requisito_nr.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Item / Subitem</label>
            <input
              {...register('requisito_item')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.requisito_item && <p className="mt-1 text-xs text-red-500">{errors.requisito_item.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Procedimento interno</label>
            <input
              {...register('requisito_procedimento')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Política de SST</label>
            <input
              {...register('requisito_politica')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">5. Análise de Risco Associada</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Perigo identificado</label>
            <input
              {...register('risco_perigo')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.risco_perigo && <p className="mt-1 text-xs text-red-500">{errors.risco_perigo.message}</p>}
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Risco associado</label>
            <input
              {...register('risco_associado')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            {errors.risco_associado && <p className="mt-1 text-xs text-red-500">{errors.risco_associado.message}</p>}
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Possíveis consequências</label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {consequenciasOptions.map((option) => (
              <label key={option} className="flex items-center space-x-3 text-sm">
                <input
                  type="checkbox"
                  value={option}
                  {...register('risco_consequencias')}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Nível de risco</label>
          <select
            {...register('risco_nivel')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {niveisRisco.map((nivel) => (
              <option key={nivel} value={nivel}>{nivel}</option>
            ))}
          </select>
          {errors.risco_nivel && <p className="mt-1 text-xs text-red-500">{errors.risco_nivel.message}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">6. Causa da Não Conformidade</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {causasOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register('causa')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
        <div className="mt-4">
          <label className="mb-2 block text-sm font-bold text-gray-700">Outro (descrever)</label>
          <input
            {...register('causa_outro')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">7. Ação Corretiva Imediata</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Medida adotada</label>
            <textarea
              {...register('acao_imediata_descricao')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Data da ação</label>
            <input
              type="date"
              {...register('acao_imediata_data')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Responsável</label>
            <input
              {...register('acao_imediata_responsavel')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Status</label>
            <select
              {...register('acao_imediata_status')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {statusAcao.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">8. Ação Corretiva Definitiva</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Descrição detalhada</label>
            <textarea
              {...register('acao_definitiva_descricao')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Prazo para implementação</label>
            <input
              type="date"
              {...register('acao_definitiva_prazo')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Responsável pela execução</label>
            <input
              {...register('acao_definitiva_responsavel')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Recursos necessários</label>
            <input
              {...register('acao_definitiva_recursos')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Data prevista de conclusão</label>
            <input
              type="date"
              {...register('acao_definitiva_data_prevista')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">9. Ação Preventiva</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Medidas para evitar reincidência</label>
            <textarea
              {...register('acao_preventiva_medidas')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Treinamento necessário</label>
            <input
              {...register('acao_preventiva_treinamento')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Revisão de procedimento</label>
            <input
              {...register('acao_preventiva_revisao_procedimento')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Melhoria de processo</label>
            <input
              {...register('acao_preventiva_melhoria_processo')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Implementação de EPC / EPI</label>
            <input
              {...register('acao_preventiva_epc_epi')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">10. Verificação de Eficácia</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Ação eliminou ou reduziu o risco?</label>
            <select
              {...register('verificacao_resultado')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {resultadoEficacia.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Data da verificação</label>
            <input
              type="date"
              {...register('verificacao_data')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">Evidências</label>
            <textarea
              {...register('verificacao_evidencias')}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Responsável pela validação</label>
            <input
              {...register('verificacao_responsavel')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">11. Status da Não Conformidade</h2>
        <select
          {...register('status')}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          {statusOptions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        {errors.status && <p className="mt-1 text-xs text-red-500">{errors.status.message}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">12. Observações Gerais</h2>
        <textarea
          {...register('observacoes_gerais')}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-bold text-gray-700">Fotos / registros anexos</label>
            <button
              type="button"
              onClick={() => appendAnexo({ url: '' })}
              className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Adicionar anexo</span>
            </button>
          </div>
          <div className="space-y-2">
            {anexosFields.map((field, index) => (
              <div key={field.id} className="flex items-center space-x-2">
                <input
                  {...register(`anexos.${index}.url` as const)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="URL ou identificação do anexo"
                />
                <button
                  type="button"
                  onClick={() => removeAnexo(index)}
                  className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                  title="Remover anexo"
                  aria-label={`Remover anexo ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">13. Assinaturas</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Responsável pela área</label>
            <input
              {...register('assinatura_responsavel_area')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Técnico / Auditor de SST</label>
            <input
              {...register('assinatura_tecnico_auditor')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">Gestão / Coordenação</label>
            <input
              {...register('assinatura_gestao')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard/nonconformities')}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || isSubmitting || !isValid}
          className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Salvando...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Salvar</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
