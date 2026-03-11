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

export const TemplateItem = React.memo(({ index, register, remove }: TemplateItemProps) => {
  return (
    <div className="grid grid-cols-12 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="col-span-12 md:col-span-6">
        <label className="mb-1 block text-xs font-medium text-gray-500">Pergunta / Item</label>
        <input
          {...register(`itens.${index}.item`)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Ex: Verificar condições dos pneus"
        />
      </div>

      <div className="col-span-6 md:col-span-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Tipo de Resposta</label>
        <select
          {...register(`itens.${index}.tipo_resposta`)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="conforme">Conforme / NC / NA</option>
          <option value="sim_nao">Sim / Não</option>
          <option value="sim_nao_na">Sim / Não / N/A</option>
          <option value="texto">Texto Livre</option>
          <option value="foto">Apenas Foto</option>
        </select>
      </div>

      <div className="col-span-3 md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-gray-500">Peso (Risco)</label>
        <input
          type="number"
          min="1"
          max="5"
          {...register(`itens.${index}.peso`, { valueAsNumber: true })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="col-span-3 md:col-span-1 flex items-end justify-end pb-2">
        <button
          type="button"
          onClick={() => remove(index)}
          className="text-red-500 hover:text-red-700"
          title="Remover item"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
});

TemplateItem.displayName = 'TemplateItem';
