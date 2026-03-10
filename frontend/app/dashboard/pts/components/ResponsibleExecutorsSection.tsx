'use client';

import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { CheckCircle2, PenLine } from 'lucide-react';
import type { User } from '@/services/usersService';
import { cn } from '@/lib/utils';

type ResponsibleExecutorsSectionProps = {
  filteredUsers: User[];
  selectedCompanyId: string;
  signatures: Record<string, { data: string; type: string }>;
  onToggleExecutante: (userId: string) => void;
};

export function ResponsibleExecutorsSection({
  filteredUsers,
  selectedCompanyId,
  signatures,
  onToggleExecutante,
}: ResponsibleExecutorsSectionProps) {
  const { watch } = useFormContext();
  const selectedExecutanteIds: string[] = watch('executantes') || [];

  const usersList = useMemo(() => filteredUsers || [], [filteredUsers]);

  return (
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <h2 className="mb-2 text-lg font-bold text-gray-900 flex items-center gap-2">
        Executantes e Assinaturas
        <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
      </h2>
      <p className="mb-6 text-sm text-gray-600">
        Selecione os executantes e colete as assinaturas necessárias.
      </p>

      {!selectedCompanyId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Selecione uma empresa na etapa anterior para listar os colaboradores.
        </div>
      ) : usersList.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Nenhum colaborador encontrado para esta empresa.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {usersList.map((u) => {
            const isSelected = selectedExecutanteIds.includes(u.id);
            const hasSignature = !!signatures[u.id]?.data;

            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggleExecutante(u.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all hover:bg-gray-50',
                  isSelected ? 'border-amber-200 bg-amber-50/40 ring-2 ring-amber-500/10 shadow-[var(--ds-shadow-sm)]' : 'border-gray-200',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">{u.nome}</p>
                  <p className="truncate text-xs text-gray-600">{u.email || '—'}</p>
                </div>

                <div className="ml-3 flex items-center gap-2">
                  {hasSignature ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Assinado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                      <PenLine className="h-4 w-4" />
                      Assinar
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
