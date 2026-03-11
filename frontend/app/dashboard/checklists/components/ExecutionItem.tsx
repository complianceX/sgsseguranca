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
  const choiceBaseClassName =
    'flex cursor-pointer items-center gap-1 rounded-[var(--ds-radius-sm)] border px-3 py-1 text-sm transition-colors';

  return (
    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 p-4 transition-colors hover:border-[var(--ds-color-warning-border)]">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <p className="font-medium text-[var(--ds-color-text-primary)]">
            {index + 1}. {item.item}
            {item.obrigatorio && <span className="ml-1 text-[var(--ds-color-danger)]">*</span>}
          </p>
          {item.peso > 1 && (
            <span className="mt-1 inline-block rounded-[var(--ds-radius-sm)] bg-[var(--ds-color-warning-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-warning)]">
              Peso: {item.peso}
            </span>
          )}
        </div>

        {/* Controles de Resposta */}
        <div className="ml-4">
          {item.tipo_resposta === 'sim_nao' && (
            <div className="flex gap-2">
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'sim'
                    ? 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="sim" {...register(`itens.${index}.status`)} className="hidden" />
                Sim
              </label>
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'nao'
                    ? 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="nao" {...register(`itens.${index}.status`)} className="hidden" />
                Não
              </label>
            </div>
          )}

          {item.tipo_resposta === 'sim_nao_na' && (
            <div className="flex gap-2">
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'sim'
                    ? 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="sim" {...register(`itens.${index}.status`)} className="hidden" />
                Sim
              </label>
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'nao'
                    ? 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="nao" {...register(`itens.${index}.status`)} className="hidden" />
                Não
              </label>
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'na'
                    ? 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="na" {...register(`itens.${index}.status`)} className="hidden" />
                N/A
              </label>
            </div>
          )}

          {item.tipo_resposta === 'conforme' && (
            <div className="flex gap-2">
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'ok'
                    ? 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="ok" {...register(`itens.${index}.status`)} className="hidden" />
                C
              </label>
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'nok'
                    ? 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
                <input type="radio" value="nok" {...register(`itens.${index}.status`)} className="hidden" />
                NC
              </label>
              <label
                className={`${choiceBaseClassName} ${
                  statusValue === 'na'
                    ? 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]'
                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)]'
                }`}
              >
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
          className={`w-full rounded-[var(--ds-radius-md)] border px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
            (statusValue === 'nok' || statusValue === 'nao') && !observacaoValue
              ? 'border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] placeholder:text-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)] focus:ring-2 focus:ring-[color:var(--ds-color-danger)]/25'
              : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]'
          }`}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-[var(--ds-color-action-primary)] transition-colors hover:text-[var(--ds-color-action-primary-hover)]"
        >
          <Camera className="h-3 w-3" />
          Adicionar Foto
        </button>
      </div>
    </div>
  );
});

ExecutionItem.displayName = 'ExecutionItem';
