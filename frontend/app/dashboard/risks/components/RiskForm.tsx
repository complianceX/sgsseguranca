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
import { PageHeader } from '@/components/layout';
import { PageLoadingState } from '@/components/ui/state';
import { StatusPill } from '@/components/ui/status-pill';

const fieldClassName =
  'mt-1 block w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] motion-safe:transition-all motion-safe:duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--ds-shadow-sm)]';
const errorFieldClassName =
  'border-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)]';
const labelClassName =
  'block text-sm font-medium text-[var(--ds-color-text-secondary)]';
const helperClassName = 'mt-1 text-xs text-[var(--ds-color-text-muted)]';
const errorClassName = 'mt-1 text-xs text-[var(--ds-color-danger)]';
const sectionCardClassName =
  'rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-xs)]';

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
      <PageLoadingState
        title={id ? 'Carregando risco' : 'Preparando risco'}
        description="Buscando empresa, classificação e parâmetros de avaliação para montar o formulário."
        cards={2}
        tableRows={3}
      />
    );
  }

  return (
    <div className="ds-form-page mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Cadastro de riscos"
        title={id ? 'Editar risco' : 'Novo risco'}
        description="Defina categoria, avaliação e controles para padronizar o mapa de risco e a operação."
        icon={
          <Link
            href="/dashboard/risks"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)] motion-safe:transition hover:bg-[var(--ds-color-surface-muted)]"
            title="Voltar"
            aria-label="Voltar para a lista de riscos"
          >
            <ArrowLeft className="h-5 w-5 text-[var(--ds-color-text-secondary)]" />
          </Link>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="warning">Risco</StatusPill>
            <StatusPill tone={id ? 'warning' : 'success'}>
              {id ? 'Edição' : 'Novo cadastro'}
            </StatusPill>
          </div>
        }
      />
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-secondary)]">
          Cadastro guiado
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
          Estruture o risco com classificação consistente, parâmetros de avaliação e medidas de controle.
        </p>
        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
          Revise empresa, categoria e criticidade antes de salvar para manter a base de riscos padronizada.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-[var(--ds-shadow-sm)]">
        <section className={sectionCardClassName}>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Contexto e classificação
            </p>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Defina a empresa, a categoria e o nome do risco para uso em APRs, PTs e análises administrativas.
            </p>
          </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="company_id" className={labelClassName}>Empresa</label>
            <select
              id="company_id"
              {...register('company_id')}
              aria-invalid={errors.company_id ? 'true' : undefined}
              className={`${fieldClassName} ${
                errors.company_id ? errorFieldClassName : ''
              }`}
            >
              <option value="">Selecione uma empresa</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.razao_social}</option>
              ))}
            </select>
            {errors.company_id ? (
              <p className={errorClassName}>{errors.company_id.message}</p>
            ) : (
              <p className={helperClassName}>A empresa define o tenant da biblioteca de riscos.</p>
            )}
          </div>

          <div>
            <label htmlFor="nome" className={labelClassName}>Nome do Risco</label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              aria-invalid={errors.nome ? 'true' : undefined}
              className={`${fieldClassName} ${
                errors.nome ? errorFieldClassName : ''
              }`}
              placeholder="Ex: Queda de mesmo nível"
            />
            {errors.nome ? (
              <p className={errorClassName}>{errors.nome.message}</p>
            ) : (
              <p className={helperClassName}>Use um nome direto para facilitar busca, sugestão e reaproveitamento.</p>
            )}
          </div>

          <div>
            <label htmlFor="categoria" className={labelClassName}>Categoria</label>
            <select
              id="categoria"
              {...register('categoria')}
              aria-invalid={errors.categoria ? 'true' : undefined}
              className={`${fieldClassName} ${
                errors.categoria ? errorFieldClassName : ''
              }`}
            >
              <option value="">Selecione uma categoria</option>
              <option value="Físico">Físico</option>
              <option value="Químico">Químico</option>
              <option value="Biológico">Biológico</option>
              <option value="Ergonômico">Ergonômico</option>
              <option value="Acidente">Acidente</option>
            </select>
            {errors.categoria ? (
              <p className={errorClassName}>{errors.categoria.message}</p>
            ) : (
              <p className={helperClassName}>Classifique corretamente para manter relatórios e filtros coerentes.</p>
            )}
          </div>

          <div>
            <label htmlFor="descricao" className={labelClassName}>Descrição</label>
            <textarea
              id="descricao"
              {...register('descricao')}
              aria-label="Descrição do risco"
              rows={4}
              className={fieldClassName}
              placeholder="Descreva brevemente o risco..."
            />
            <p className={helperClassName}>Use este campo para contexto, condição perigosa ou cenário de ocorrência.</p>
          </div>

          <div>
            <label htmlFor="medidas_controle" className={labelClassName}>Medidas de Controle</label>
            <textarea
              id="medidas_controle"
              {...register('medidas_controle')}
              aria-label="Medidas de controle"
              rows={4}
              className={fieldClassName}
              placeholder="Informe as medidas de controle adotadas..."
            />
            <p className={helperClassName}>Descreva controles existentes ou recomendados de forma prática e verificável.</p>
          </div>
        </div>
        </section>

        <section className={sectionCardClassName}>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Avaliação e hierarquia
            </p>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Registre os parâmetros que ajudam a calcular a criticidade e orientar a resposta operacional.
            </p>
          </div>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor="probability" className={labelClassName}>Probabilidade (1-5)</label>
              <input
                id="probability"
                type="number"
                min={1}
                max={5}
                {...register('probability', { valueAsNumber: true })}
                aria-label="Probabilidade"
                className={fieldClassName}
                placeholder="1 a 5"
              />
              <p className={helperClassName}>Baixa a muito alta chance de ocorrência.</p>
            </div>
            <div>
              <label htmlFor="severity" className={labelClassName}>Severidade (1-5)</label>
              <input
                id="severity"
                type="number"
                min={1}
                max={5}
                {...register('severity', { valueAsNumber: true })}
                aria-label="Severidade"
                className={fieldClassName}
                placeholder="1 a 5"
              />
              <p className={helperClassName}>Impacto potencial do dano ou evento.</p>
            </div>
            <div>
              <label htmlFor="exposure" className={labelClassName}>Exposição (1-5)</label>
              <input
                id="exposure"
                type="number"
                min={1}
                max={5}
                {...register('exposure', { valueAsNumber: true })}
                aria-label="Exposição"
                className={fieldClassName}
                placeholder="1 a 5"
              />
              <p className={helperClassName}>Frequência ou tempo de exposição ao risco.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="residual_risk" className={labelClassName}>Risco Residual</label>
              <select
                id="residual_risk"
                {...register('residual_risk')}
                aria-label="Risco residual"
                className={fieldClassName}
              >
                <option value="">Automático</option>
                <option value="LOW">Baixo</option>
                <option value="MEDIUM">Médio</option>
                <option value="HIGH">Alto</option>
                <option value="CRITICAL">Crítico</option>
              </select>
              <p className={helperClassName}>Deixe automático quando a classificação vier da lógica do sistema.</p>
            </div>
            <div>
              <label htmlFor="control_hierarchy" className={labelClassName}>Hierarquia de Controle</label>
              <select
                id="control_hierarchy"
                {...register('control_hierarchy')}
                aria-label="Hierarquia de controle"
                className={fieldClassName}
              >
                <option value="">Selecione</option>
                <option value="ELIMINATION">Eliminação</option>
                <option value="SUBSTITUTION">Substituição</option>
                <option value="ENGINEERING">Engenharia</option>
                <option value="ADMINISTRATIVE">Administrativo</option>
                <option value="PPE">EPI</option>
              </select>
              <p className={helperClassName}>Priorize controles mais fortes antes de depender de EPI.</p>
            </div>
          </div>

          <div>
            <label htmlFor="control_description" className={labelClassName}>Descrição do Controle</label>
            <textarea
              id="control_description"
              {...register('control_description')}
              aria-label="Descrição do controle"
              rows={3}
              className={fieldClassName}
            />
            <p className={helperClassName}>Explique como o controle é aplicado e como sua eficácia é verificada.</p>
          </div>
        </div>
        </section>

        <section className={sectionCardClassName}>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              Evidências
            </p>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Registre referências e confirme se o controle possui evidência validada.
            </p>
          </div>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="evidence_photo" className={labelClassName}>Evidência (foto/url)</label>
              <input
                id="evidence_photo"
                type="text"
                {...register('evidence_photo')}
                aria-label="Evidência em foto ou URL"
                className={fieldClassName}
                placeholder="Link para foto ou evidência visual"
              />
              <p className={helperClassName}>Use um link quando a comprovação visual estiver fora do sistema.</p>
            </div>
            <div>
              <label htmlFor="evidence_document" className={labelClassName}>Evidência documental</label>
              <input
                id="evidence_document"
                type="text"
                {...register('evidence_document')}
                aria-label="Evidência documental"
                className={fieldClassName}
                placeholder="Procedimento, laudo ou referência documental"
              />
              <p className={helperClassName}>Informe documento, procedimento ou laudo relacionado ao controle.</p>
            </div>
          </div>

          <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-4 py-3">
            <label htmlFor="control_evidence" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-color-text-secondary)]">
              <input id="control_evidence" type="checkbox" {...register('control_evidence')} className="h-4 w-4 rounded border-[var(--ds-color-border-default)] accent-[var(--ds-color-action-primary)]" />
              Controle com evidência validada
            </label>
            <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
              Marque somente quando houver comprovação objetiva do controle implementado.
            </p>
          </div>
        </div>
        </section>

        <div className="flex justify-end space-x-3 border-t pt-6">
          <Link
            href="/dashboard/risks"
            className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)] motion-safe:transition-colors"
          >
            Cancelar
          </Link>
          <Button
            type="submit"
            loading={loading}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {id ? 'Salvar alterações' : 'Criar risco'}
          </Button>
        </div>
      </form>
    </div>
  );
}
