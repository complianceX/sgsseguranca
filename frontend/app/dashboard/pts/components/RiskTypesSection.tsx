import React from 'react';
import { useFormContext } from 'react-hook-form';
import { cn } from '@/lib/utils';

export const RiskTypesSection = () => {
  const { register, watch } = useFormContext();

  const riskTypes = [
    { id: 'trabalho_altura', label: 'Altura' },
    { id: 'espaco_confinado', label: 'Espaço Confinado' },
    { id: 'trabalho_quente', label: 'Quente' },
    { id: 'eletricidade', label: 'Eletricidade' },
    { id: 'escavacao', label: 'Escavação' },
  ] as const;

  return (
    <div className="ds-form-section">
      <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
        Riscos Adicionais / Tipos de Trabalho
        <span className="h-2 w-2 rounded-full bg-[var(--ds-color-warning)]"></span>
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {riskTypes.map((item) => (
          <label
            key={item.id}
            className={cn(
              "flex cursor-pointer select-none items-center space-x-3 rounded-xl border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-4 motion-safe:transition-all hover:border-[var(--color-border)] hover:bg-[color:var(--color-card-muted)]/24",
              watch(item.id)
                ? "border-[color:var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]"
                : ""
            )}
          >
            <input
              type="checkbox"
              {...register(item.id)}
              className="h-5 w-5 rounded border-[var(--color-border)] text-[var(--color-primary)] motion-safe:transition-all focus:ring-[var(--color-primary)]"
            />
            <span className={cn(
              "text-sm font-medium motion-safe:transition-colors",
              watch(item.id) ? "text-[var(--ds-color-warning)]" : "text-[var(--color-text-secondary)]"
            )}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
