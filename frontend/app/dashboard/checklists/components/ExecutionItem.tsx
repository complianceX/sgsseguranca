import React from 'react';
import { Camera } from 'lucide-react';
import { UseFormRegister, UseFormWatch } from 'react-hook-form';
import { ChecklistFormData, ChecklistItemForm } from '../types';

interface ExecutionItemProps {
  item: ChecklistItemForm;
  index: number;
  register: UseFormRegister<ChecklistFormData>;
  watch: UseFormWatch<ChecklistFormData>;
}

export const ExecutionItem = React.memo(({ item, index, register, watch }: ExecutionItemProps) => {
  const statusValue = watch(`itens.${index}.status`);
  const observacaoValue = watch(`itens.${index}.observacao`);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 transition-colors hover:border-amber-300">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium text-gray-900">
            {index + 1}. {item.item}
            {item.obrigatorio && <span className="ml-1 text-red-500">*</span>}
          </p>
          {item.peso > 1 && (
            <span className="mt-1 inline-block rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
              Peso: {item.peso}
            </span>
          )}
        </div>

        {/* Controles de Resposta */}
        <div className="ml-4">
          {item.tipo_resposta === 'sim_nao' && (
            <div className="flex gap-2">
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'sim' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="sim" {...register(`itens.${index}.status`)} className="hidden" />
                Sim
              </label>
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'nao' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="nao" {...register(`itens.${index}.status`)} className="hidden" />
                Não
              </label>
            </div>
          )}

          {item.tipo_resposta === 'sim_nao_na' && (
            <div className="flex gap-2">
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'sim' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="sim" {...register(`itens.${index}.status`)} className="hidden" />
                Sim
              </label>
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'nao' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="nao" {...register(`itens.${index}.status`)} className="hidden" />
                Não
              </label>
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'na' ? 'bg-gray-200 text-gray-700 ring-2 ring-gray-400' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="na" {...register(`itens.${index}.status`)} className="hidden" />
                N/A
              </label>
            </div>
          )}

          {item.tipo_resposta === 'conforme' && (
            <div className="flex gap-2">
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'ok' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="ok" {...register(`itens.${index}.status`)} className="hidden" />
                C
              </label>
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'nok' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="nok" {...register(`itens.${index}.status`)} className="hidden" />
                NC
              </label>
              <label className={`flex cursor-pointer items-center gap-1 rounded px-3 py-1 ${statusValue === 'na' ? 'bg-gray-200 text-gray-700 ring-2 ring-gray-400' : 'bg-white text-gray-600 border'}`}>
                <input type="radio" value="na" {...register(`itens.${index}.status`)} className="hidden" />
                N/A
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2">
        <input
          {...register(`itens.${index}.observacao`)}
          placeholder={
            (statusValue === 'nok' || statusValue === 'nao')
              ? "Observação obrigatória para Não Conformidade..."
              : "Observações..."
          }
          className={`w-full rounded border px-3 py-2 text-sm focus:outline-none ${
            (statusValue === 'nok' || statusValue === 'nao') && !observacaoValue
              ? 'border-red-300 bg-red-50 placeholder-red-400 focus:border-red-500'
              : 'border-gray-200 focus:border-blue-500'
          }`}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="flex items-center gap-1 text-xs text-slate-800 hover:text-blue-800">
          <Camera className="h-3 w-3" />
          Adicionar Foto
        </button>
      </div>
    </div>
  );
});

ExecutionItem.displayName = 'ExecutionItem';
