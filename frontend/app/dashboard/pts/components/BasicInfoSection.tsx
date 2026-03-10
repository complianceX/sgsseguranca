'use client';

import React, { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Sparkles, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Company } from '@/services/companiesService';
import type { Site } from '@/services/sitesService';
import type { Apr } from '@/services/aprsService';
import type { User } from '@/services/usersService';
import { cn } from '@/lib/utils';

type BasicInfoSectionProps = {
  companies: Company[];
  filteredSites: Site[];
  filteredAprs: Apr[];
  filteredUsers: User[];
  analyzing: boolean;
  onAiAnalysis: () => void;
  onPdfUploaded: (key: string) => void;
};

export function BasicInfoSection({
  companies,
  filteredSites,
  filteredAprs,
  filteredUsers,
  analyzing,
  onAiAnalysis,
  onPdfUploaded,
}: BasicInfoSectionProps) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();

  const [selectedPdfName, setSelectedPdfName] = useState<string>('');

  const companyId = watch('company_id');
  const siteId = watch('site_id');

  const responsaveis = useMemo(() => {
    if (!companyId) return [];
    return filteredUsers || [];
  }, [companyId, filteredUsers]);

  return (
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            Dados Básicos da PT
            <span className="h-2 w-2 rounded-full bg-amber-600"></span>
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Preencha os dados principais para emissão da Permissão de Trabalho.
          </p>
        </div>

        <button
          type="button"
          onClick={onAiAnalysis}
          disabled={analyzing}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl bg-[image:var(--ds-gradient-brand)] px-4 py-2.5 text-sm font-bold text-white shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:brightness-105 disabled:opacity-60',
          )}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          COMPLIANCE X
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="pt-numero" className="block text-sm font-semibold text-gray-700 mb-1">
            Número <span className="text-red-500">*</span>
          </label>
          <input
            id="pt-numero"
            {...register('numero')}
            aria-invalid={errors.numero ? 'true' : undefined}
            placeholder="Ex: PT-001"
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.numero ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          />
          {errors.numero && (
            <p className="mt-1 text-xs text-red-500">{String((errors as any).numero?.message)}</p>
          )}
        </div>

        <div>
          <label htmlFor="pt-status" className="block text-sm font-semibold text-gray-700 mb-1">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            id="pt-status"
            {...register('status')}
            aria-invalid={errors.status ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.status ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          >
            <option value="Pendente">Pendente</option>
            <option value="Aprovada">Aprovada</option>
            <option value="Cancelada">Cancelada</option>
            <option value="Encerrada">Encerrada</option>
            <option value="Expirada">Expirada</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="pt-titulo" className="block text-sm font-semibold text-gray-700 mb-1">
            Título <span className="text-red-500">*</span>
          </label>
          <input
            id="pt-titulo"
            {...register('titulo')}
            aria-invalid={errors.titulo ? 'true' : undefined}
            placeholder="Descreva o trabalho a ser executado"
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.titulo ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          />
          {errors.titulo && (
            <p className="mt-1 text-xs text-red-500">{String((errors as any).titulo?.message)}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label htmlFor="pt-descricao" className="block text-sm font-semibold text-gray-700 mb-1">
            Descrição
          </label>
          <textarea
            id="pt-descricao"
            {...register('descricao')}
            aria-label="Descrição da permissão de trabalho"
            rows={3}
            placeholder="Detalhe a atividade, riscos e controles"
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.descricao ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          />
        </div>

        <div>
          <label htmlFor="pt-data-hora-inicio" className="block text-sm font-semibold text-gray-700 mb-1">
            Início <span className="text-red-500">*</span>
          </label>
          <input
            id="pt-data-hora-inicio"
            type="datetime-local"
            {...register('data_hora_inicio')}
            aria-invalid={errors.data_hora_inicio ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.data_hora_inicio ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          />
        </div>

        <div>
          <label htmlFor="pt-data-hora-fim" className="block text-sm font-semibold text-gray-700 mb-1">
            Fim <span className="text-red-500">*</span>
          </label>
          <input
            id="pt-data-hora-fim"
            type="datetime-local"
            {...register('data_hora_fim')}
            aria-invalid={errors.data_hora_fim ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.data_hora_fim ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          />
        </div>

        <div>
          <label htmlFor="pt-company-id" className="block text-sm font-semibold text-gray-700 mb-1">
            Empresa <span className="text-red-500">*</span>
          </label>
          <select
            id="pt-company-id"
            {...register('company_id')}
            onChange={(e) => {
              setValue('company_id', e.target.value, { shouldValidate: true });
              setValue('site_id', '', { shouldValidate: true });
              setValue('apr_id', '', { shouldValidate: true });
              setValue('responsavel_id', '', { shouldValidate: true });
            }}
            aria-invalid={errors.company_id ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              errors.company_id ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          >
            <option value="">Selecione...</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razao_social}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pt-site-id" className="block text-sm font-semibold text-gray-700 mb-1">
            Obra / Site <span className="text-red-500">*</span>
          </label>
          <select
            id="pt-site-id"
            {...register('site_id')}
            disabled={!companyId}
            aria-invalid={errors.site_id ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none disabled:bg-gray-100',
              errors.site_id ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          >
            <option value="">{companyId ? 'Selecione...' : 'Selecione a empresa'}</option>
            {filteredSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pt-apr-id" className="block text-sm font-semibold text-gray-700 mb-1">
            APR (opcional)
          </label>
          <select
            id="pt-apr-id"
            {...register('apr_id')}
            disabled={!companyId}
            aria-label="APR vinculada"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none disabled:bg-gray-100"
          >
            <option value="">{companyId ? 'Selecione...' : 'Selecione a empresa'}</option>
            {filteredAprs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.numero}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pt-responsavel-id" className="block text-sm font-semibold text-gray-700 mb-1">
            Responsável <span className="text-red-500">*</span>
          </label>
          <select
            id="pt-responsavel-id"
            {...register('responsavel_id')}
            disabled={!companyId}
            aria-invalid={errors.responsavel_id ? 'true' : undefined}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-amber-500/20 focus:outline-none disabled:bg-gray-100',
              errors.responsavel_id ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-amber-500',
            )}
          >
            <option value="">{companyId ? 'Selecione...' : 'Selecione a empresa'}</option>
            {responsaveis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          {errors.responsavel_id && (
            <p className="mt-1 text-xs text-red-500">{String((errors as any).responsavel_id?.message)}</p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Anexar PDF (opcional)</p>
            <p className="mt-1 text-xs text-gray-600">
              Selecione um PDF para ser associado à PT quando o documento estiver salvo.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">
            <Upload className="h-4 w-4" />
            Selecionar
            <input
              type="file"
              accept="application/pdf"
              aria-label="Selecionar PDF da PT"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSelectedPdfName(file.name);
                toast.message('PDF selecionado', { description: file.name });
                // Sem endpoint definido aqui; o upload é tratado no fluxo de salvar/editar PT.
                onPdfUploaded('');
              }}
            />
          </label>
        </div>
        {selectedPdfName && (
          <p className="mt-3 text-xs text-gray-700">
            Selecionado: <span className="font-semibold">{selectedPdfName}</span>
          </p>
        )}
        {siteId && (
          <p className="mt-1 text-[11px] text-gray-500">
            Site selecionado: {String(siteId).slice(0, 8)}…
          </p>
        )}
      </div>
    </div>
  );
}
