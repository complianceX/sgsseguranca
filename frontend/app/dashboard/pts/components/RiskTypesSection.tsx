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
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <h2 className="mb-6 text-lg font-bold text-gray-900 flex items-center gap-2">
        Riscos Adicionais / Tipos de Trabalho
        <span className="h-2 w-2 rounded-full bg-amber-500"></span>
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {riskTypes.map((item) => (
          <label
            key={item.id}
            className={cn(
              "flex cursor-pointer select-none items-center space-x-3 rounded-xl border p-4 transition-all hover:bg-gray-50",
              watch(item.id) ? "border-blue-200 bg-blue-50/50 ring-2 ring-blue-500/10 shadow-[var(--ds-shadow-sm)]" : "border-gray-200"
            )}
          >
            <input
              type="checkbox"
              {...register(item.id)}
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-all"
            />
            <span className={cn(
              "text-sm font-medium transition-colors",
              watch(item.id) ? "text-blue-700" : "text-gray-700"
            )}>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
