'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { inspectionsService } from '@/services/inspectionsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Save, Plus, Trash2, Loader2, Camera } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const perigoRiscoSchema = z.object({
  grupo_risco: z.string().min(1, 'O grupo de risco é obrigatório'),
  perigo_fator_risco: z.string().min(1, 'O perigo/fator de risco é obrigatório'),
  fonte_circunstancia: z.string().min(1, 'A fonte/circunstância é obrigatória'),
  trabalhadores_expostos: z.string().min(1, 'Informe os trabalhadores expostos'),
  tipo_exposicao: z.string().min(1, 'O tipo de exposição é obrigatório'),
  medidas_existentes: z.string().min(1, 'As medidas existentes são obrigatórias'),
  severidade: z.string().min(1, 'A severidade é obrigatória'),
  probabilidade: z.string().min(1, 'A probabilidade é obrigatória'),
  nivel_risco: z.string().min(1, 'O nível de risco é obrigatório'),
  classificacao_risco: z.string().min(1, 'A classificação de risco é obrigatória'),
  acoes_necessarias: z.string().min(1, 'As ações necessárias são obrigatórias'),
  prazo: z.string().min(1, 'O prazo é obrigatório'),
  responsavel: z.string().min(1, 'O responsável é obrigatório'),
});

const planoAcaoSchema = z.object({
  acao: z.string().min(1, 'A ação é obrigatória'),
  responsavel: z.string().min(1, 'O responsável é obrigatório'),
  prazo: z.string().min(1, 'O prazo é obrigatório'),
  status: z.string().min(1, 'O status é obrigatório'),
});

const evidenciaSchema = z.object({
  descricao: z.string().min(1, 'A descrição é obrigatória'),
  url: z.string().optional(),
});

const inspectionSchema = z.object({
  site_id: z.string().min(1, 'Selecione um site'),
  setor_area: z.string().min(1, 'O setor/área é obrigatório'),
  tipo_inspecao: z.string().min(1, 'O tipo de inspeção é obrigatório'),
  data_inspecao: z.string(),
  horario: z.string().min(1, 'O horário é obrigatório'),
  responsavel_id: z.string().min(1, 'Selecione o responsável'),
  objetivo: z.string().optional(),
  descricao_local_atividades: z.string().optional(),
  metodologia: z.array(z.string()).optional(),
  perigos_riscos: z.array(perigoRiscoSchema).optional(),
  plano_acao: z.array(planoAcaoSchema).optional(),
  evidencias: z.array(evidenciaSchema).optional(),
  conclusao: z.string().optional(),
});

type InspectionFormData = z.infer<typeof inspectionSchema>;

interface InspectionFormProps {
  id?: string;
}

export function InspectionForm({ id }: InspectionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<InspectionFormData>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      data_inspecao: new Date().toISOString().split('T')[0],
      horario: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      tipo_inspecao: 'Rotina',
      metodologia: [],
      perigos_riscos: [],
      plano_acao: [],
      evidencias: [],
    },
  });

  const { fields: prFields, append: appendPR, remove: removePR } = useFieldArray({
    control,
    name: 'perigos_riscos',
  });

  const { fields: paFields, append: appendPA, remove: removePA } = useFieldArray({
    control,
    name: 'plano_acao',
  });

  const { fields: evFields, append: appendEV, remove: removeEV } = useFieldArray({
    control,
    name: 'evidencias',
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sitesData, usersData] = await Promise.all([
          sitesService.findAll(),
          usersService.findAll(),
        ]);
        setSites(sitesData);
        setUsers(usersData);

        if (id) {
          const inspection = await inspectionsService.findOne(id);
          reset({
            ...inspection,
            data_inspecao: new Date(inspection.data_inspecao).toISOString().split('T')[0],
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

  const onSubmit = async (data: InspectionFormData) => {
    setLoading(true);
    try {
      if (id) {
        await inspectionsService.update(id, data);
        toast.success('Relatório de inspeção atualizado com sucesso');
      } else {
        await inspectionsService.create(data);
        toast.success('Relatório de inspeção criado com sucesso');
      }
      router.push('/dashboard/inspections');
    } catch (error) {
      console.error('Error saving inspection:', error);
      toast.error('Erro ao salvar relatório de inspeção');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const metodologiaOptions = [
    'Observação Direta',
    'Entrevistas com Colaboradores',
    'Análise de Documentação',
    'Medições Ambientais',
    'Checklist de Conformidade',
    'Análise de Processos',
  ];

  const gruposRisco = ['Físico', 'Químico', 'Biológico', 'Ergonômico', 'Acidente'];
  const tiposExposicao = ['Permanente', 'Intermitente', 'Ocasional'];
  const niveisRisco = ['Baixo', 'Médio', 'Alto', 'Muito Alto'];
  const classificacoesRisco = ['Aceitável', 'Tolerável', 'Moderado', 'Substancial', 'Intolerável'];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 pb-12">
      {/* 1. IDENTIFICAÇÃO DA EMPRESA */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">1. IDENTIFICAÇÃO DA EMPRESA</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="inspection-site-id" className="mb-2 block text-sm font-bold text-gray-700">Site / Unidade</label>
            <select
              id="inspection-site-id"
              {...register('site_id')}
              aria-label="Selecionar site da inspeção"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Selecione o site</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.nome}</option>
              ))}
            </select>
            {errors.site_id && <p className="mt-1 text-xs text-red-500">{errors.site_id.message}</p>}
          </div>

          <div>
            <label htmlFor="inspection-setor-area" className="mb-2 block text-sm font-bold text-gray-700">Setor / Área</label>
            <input
              id="inspection-setor-area"
              {...register('setor_area')}
              aria-label="Informar setor ou área da inspeção"
              placeholder="Ex: Almoxarifado, Produção, etc."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {errors.setor_area && <p className="mt-1 text-xs text-red-500">{errors.setor_area.message}</p>}
          </div>
        </div>
      </div>

      {/* 2. IDENTIFICAÇÃO DA INSPEÇÃO */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">2. IDENTIFICAÇÃO DA INSPEÇÃO</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="inspection-tipo" className="mb-2 block text-sm font-bold text-gray-700">Tipo de Inspeção</label>
            <select
              id="inspection-tipo"
              {...register('tipo_inspecao')}
              aria-label="Selecionar tipo de inspeção"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="Rotina">Rotina</option>
              <option value="Programada">Programada</option>
              <option value="Especial">Especial</option>
              <option value="Atendimento a NR">Atendimento a NR</option>
            </select>
          </div>

          <div>
            <label htmlFor="inspection-data" className="mb-2 block text-sm font-bold text-gray-700">Data</label>
            <input
              id="inspection-data"
              type="date"
              {...register('data_inspecao')}
              aria-label="Selecionar data da inspeção"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="inspection-horario" className="mb-2 block text-sm font-bold text-gray-700">Horário</label>
            <input
              id="inspection-horario"
              type="time"
              {...register('horario')}
              aria-label="Selecionar horário da inspeção"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="inspection-responsavel" className="mb-2 block text-sm font-bold text-gray-700">Responsável</label>
            <select
              id="inspection-responsavel"
              {...register('responsavel_id')}
              aria-label="Selecionar responsável pela inspeção"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Selecione o responsável</option>
              {users.filter(u => u.role === 'admin' || u.role === 'manager').map((user) => (
                <option key={user.id} value={user.id}>{user.nome}</option>
              ))}
            </select>
            {errors.responsavel_id && <p className="mt-1 text-xs text-red-500">{errors.responsavel_id.message}</p>}
          </div>
        </div>
      </div>

      {/* 3. OBJETIVO DO RELATÓRIO */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">3. OBJETIVO DO RELATÓRIO</h2>
        <label htmlFor="inspection-objetivo" className="sr-only">Objetivo do relatório</label>
        <textarea
          id="inspection-objetivo"
          {...register('objetivo')}
          rows={3}
          aria-label="Objetivo do relatório de inspeção"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Descreva o objetivo desta inspeção..."
        />
      </div>

      {/* 4. DESCRIÇÃO DO LOCAL E DAS ATIVIDADES */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">4. DESCRIÇÃO DO LOCAL E DAS ATIVIDADES</h2>
        <label htmlFor="inspection-descricao-local" className="sr-only">Descrição do local e das atividades</label>
        <textarea
          id="inspection-descricao-local"
          {...register('descricao_local_atividades')}
          rows={3}
          aria-label="Descrição do local e das atividades"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Descreva o local e as atividades observadas..."
        />
      </div>

      {/* 5. METODOLOGIA UTILIZADA */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">5. METODOLOGIA UTILIZADA</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {metodologiaOptions.map((option) => (
            <label key={option} className="flex items-center space-x-3 text-sm">
              <input
                type="checkbox"
                value={option}
                {...register('metodologia')}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 6. IDENTIFICAÇÃO DE PERIGOS, AVALIAÇÃO E CONTROLE DOS RISCOS */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">6. IDENTIFICAÇÃO DE PERIGOS, AVALIAÇÃO E CONTROLE DOS RISCOS</h2>
          <button
            type="button"
            onClick={() => appendPR({
              grupo_risco: '',
              perigo_fator_risco: '',
              fonte_circunstancia: '',
              trabalhadores_expostos: '',
              tipo_exposicao: '',
              medidas_existentes: '',
              severidade: '',
              probabilidade: '',
              nivel_risco: '',
              classificacao_risco: '',
              acoes_necessarias: '',
              prazo: '',
              responsavel: '',
            })}
            className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar Risco</span>
          </button>
        </div>

        <div className="space-y-6">
          {prFields.map((field, index) => (
            <div key={field.id} className="relative rounded-lg border border-gray-100 bg-gray-50 p-4 pt-8">
              <button
                type="button"
                onClick={() => removePR(index)}
                className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
                title="Remover Risco"
                aria-label="Remover Risco"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Grupo de Risco</label>
                  <select
                    {...register(`perigos_riscos.${index}.grupo_risco` as const)}
                    aria-label={`Grupo de risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione</option>
                    {gruposRisco.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Perigo / Fator de Risco</label>
                  <input
                    {...register(`perigos_riscos.${index}.perigo_fator_risco` as const)}
                    aria-label={`Perigo ou fator de risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Fonte / Circunstância</label>
                  <input
                    {...register(`perigos_riscos.${index}.fonte_circunstancia` as const)}
                    aria-label={`Fonte ou circunstância ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Trabalhadores Expostos</label>
                  <input
                    {...register(`perigos_riscos.${index}.trabalhadores_expostos` as const)}
                    aria-label={`Trabalhadores expostos ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Tipo de Exposição</label>
                  <select
                    {...register(`perigos_riscos.${index}.tipo_exposicao` as const)}
                    aria-label={`Tipo de exposição ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione</option>
                    {tiposExposicao.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Medidas Existentes</label>
                  <input
                    {...register(`perigos_riscos.${index}.medidas_existentes` as const)}
                    aria-label={`Medidas existentes ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Severidade</label>
                  <input
                    {...register(`perigos_riscos.${index}.severidade` as const)}
                    aria-label={`Severidade ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Probabilidade</label>
                  <input
                    {...register(`perigos_riscos.${index}.probabilidade` as const)}
                    aria-label={`Probabilidade ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Nível de Risco</label>
                  <select
                    {...register(`perigos_riscos.${index}.nivel_risco` as const)}
                    aria-label={`Nível de risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione</option>
                    {niveisRisco.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Classificação</label>
                  <select
                    {...register(`perigos_riscos.${index}.classificacao_risco` as const)}
                    aria-label={`Classificação de risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Selecione</option>
                    {classificacoesRisco.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Ações Necessárias</label>
                  <input
                    {...register(`perigos_riscos.${index}.acoes_necessarias` as const)}
                    aria-label={`Ações necessárias ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Prazo</label>
                  <input
                    {...register(`perigos_riscos.${index}.prazo` as const)}
                    aria-label={`Prazo do risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Responsável</label>
                  <input
                    {...register(`perigos_riscos.${index}.responsavel` as const)}
                    aria-label={`Responsável do risco ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7. PLANO DE AÇÃO */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">7. PLANO DE AÇÃO</h2>
          <button
            type="button"
            onClick={() => appendPA({
              acao: '',
              responsavel: '',
              prazo: '',
              status: 'Pendente',
            })}
            className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" />
            <span>Adicionar Ação</span>
          </button>
        </div>

        <div className="space-y-4">
          {paFields.map((field, index) => (
            <div key={field.id} className="relative rounded-lg border border-gray-100 bg-gray-50 p-4 pt-8">
              <button
                type="button"
                onClick={() => removePA(index)}
                className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
                title="Remover Ação"
                aria-label="Remover Ação"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Ação</label>
                  <input
                    {...register(`plano_acao.${index}.acao` as const)}
                    aria-label={`Ação do plano ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Responsável</label>
                  <input
                    {...register(`plano_acao.${index}.responsavel` as const)}
                    aria-label={`Responsável da ação ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Prazo</label>
                  <input
                    {...register(`plano_acao.${index}.prazo` as const)}
                    aria-label={`Prazo da ação ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. EVIDÊNCIAS */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">8. EVIDÊNCIAS (FOTOS / OBSERVAÇÕES)</h2>
          <button
            type="button"
            onClick={() => appendEV({
              descricao: '',
              url: '',
            })}
            className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Camera className="h-4 w-4" />
            <span>Adicionar Evidência</span>
          </button>
        </div>

        <div className="space-y-4">
          {evFields.map((field, index) => (
            <div key={field.id} className="relative rounded-lg border border-gray-100 bg-gray-50 p-4 pt-8">
              <button
                type="button"
                onClick={() => removeEV(index)}
                className="absolute right-2 top-2 text-gray-400 hover:text-red-500"
                title="Remover Evidência"
                aria-label="Remover Evidência"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">Descrição da Evidência</label>
                  <input
                    {...register(`evidencias.${index}.descricao` as const)}
                    aria-label={`Descrição da evidência ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Ex: Foto do extintor descarregado"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-500 text-uppercase">URL da Imagem (Opcional)</label>
                  <input
                    {...register(`evidencias.${index}.url` as const)}
                    aria-label={`URL da evidência ${index + 1}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Link da imagem..."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 9. CONCLUSÃO */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">9. CONCLUSÃO</h2>
        <label htmlFor="inspection-conclusao" className="sr-only">Conclusão da inspeção</label>
        <textarea
          id="inspection-conclusao"
          {...register('conclusao')}
          rows={4}
          aria-label="Conclusão da inspeção"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Apresente as conclusões finais do relatório de inspeção..."
        />
      </div>

      {/* 10. ENCERRAMENTO */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">10. ENCERRAMENTO</h2>
        <p className="text-sm text-gray-500">
          Este relatório consolida as observações realizadas durante a inspeção. As ações corretivas devem ser acompanhadas conforme os prazos estabelecidos no Plano de Ação.
        </p>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center justify-end space-x-4">
        <Link
          href="/dashboard/inspections"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center space-x-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span>{id ? 'Atualizar Relatório' : 'Salvar Relatório'}</span>
        </button>
      </div>
    </form>
  );
}
