import React from 'react';
import { Trash2 } from 'lucide-react';
import { UseFormRegister } from 'react-hook-form';
import { ChecklistFormData, ChecklistItemForm } from '../types';

interface TemplateItemProps {
  item: ChecklistItemForm;
  index: number;
  register: UseFormRegister<ChecklistFormData>;
  remove: (index: number) => void;
}

const wrapperClassName =
  'grid grid-cols-12 gap-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 p-4';
const labelClassName = 'mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]';
const fieldClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export const TemplateItem = React.memo(({ index, register, remove }: TemplateItemProps) => {
  return (
    <div className={wrapperClassName}>
      <div className="col-span-12 md:col-span-6">
        <label className={labelClassName}>Pergunta / Item</label>
        <input
          {...register(`itens.${index}.item`)}
          className={fieldClassName}
          placeholder="Ex: Verificar condições dos pneus"
        />
      </div>

      <div className="col-span-6 md:col-span-3">
        <label className={labelClassName}>Tipo de Resposta</label>
        <select
          {...register(`itens.${index}.tipo_resposta`)}
          className={fieldClassName}
        >
          <option value="conforme">Conforme / NC / NA</option>
          <option value="sim_nao">Sim / Não</option>
          <option value="sim_nao_na">Sim / Não / N/A</option>
          <option value="texto">Texto Livre</option>
          <option value="foto">Apenas Foto</option>
        </select>
      </div>

      <div className="col-span-3 md:col-span-2">
        <label className={labelClassName}>Peso (Risco)</label>
        <input
          type="number"
          min="1"
          max="5"
          {...register(`itens.${index}.peso`, { valueAsNumber: true })}
          className={fieldClassName}
        />
      </div>

      <div className="col-span-3 md:col-span-1 flex items-end justify-end pb-2">
        <button
          type="button"
          onClick={() => remove(index)}
          className="text-[var(--ds-color-danger)] transition-colors hover:text-[var(--ds-color-danger-hover)]"
          title="Remover item"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});

TemplateItem.displayName = 'TemplateItem';
