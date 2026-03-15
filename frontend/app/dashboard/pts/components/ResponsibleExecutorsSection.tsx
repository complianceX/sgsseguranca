'use client';

import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { CheckCircle2, PenLine } from 'lucide-react';
import type { User } from '@/services/usersService';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/components/ui/status-pill';

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
    <div className="ds-form-section">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
        Executantes e Assinaturas
        <span className="h-2 w-2 rounded-full bg-[var(--ds-color-success)]"></span>
      </h2>
      <p className="mb-6 text-sm text-[var(--ds-color-text-secondary)]">
        Selecione os executantes e colete as assinaturas necessárias.
      </p>

      {!selectedCompanyId ? (
        <div className="rounded-lg border border-[color:var(--ds-color-warning)]/18 bg-[color:var(--ds-color-warning-subtle)] p-4 text-sm text-[var(--ds-color-warning)]">
          Selecione uma empresa na etapa anterior para listar os colaboradores.
        </div>
      ) : usersList.length === 0 ? (
        <div className="rounded-lg border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/24 p-4 text-sm text-[var(--ds-color-text-secondary)]">
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
                  'flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all hover:bg-[color:var(--ds-color-surface-muted)]/24',
                  isSelected
                    ? 'border-[color:var(--ds-color-warning)]/24 bg-[color:var(--ds-color-warning-subtle)]'
                    : 'border-[var(--ds-color-border-subtle)]',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ds-color-text-primary)]">{u.nome}</p>
                  <p className="truncate text-xs text-[var(--ds-color-text-secondary)]">{u.email || '—'}</p>
                </div>

                <div className="ml-3 flex items-center gap-2">
                  {hasSignature ? (
                    <StatusPill tone="success">
                      <CheckCircle2 className="h-4 w-4" />
                      Assinado
                    </StatusPill>
                  ) : (
                    <StatusPill>
                      <PenLine className="h-4 w-4" />
                      Assinar
                    </StatusPill>
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
