import React from 'react';
import { Camera } from 'lucide-react';
import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { ChecklistFormData, ChecklistItemForm } from '../types';

interface ExecutionItemProps {
  item: ChecklistItemForm;
  index: number;
  register: UseFormRegister<ChecklistFormData>;
  watch: UseFormWatch<ChecklistFormData>;
  setValue?: UseFormSetValue<ChecklistFormData>;
}

export const ExecutionItem = React.memo(({ item, index, register, watch }: ExecutionItemProps) => {
  const statusValue = watch(`itens.${index}.status`);
  const observacaoValue = watch(`itens.${index}.observacao`);
  const choiceBaseClassName =
    'flex cursor-pointer items-center gap-1 rounded-[var(--ds-radius-sm)] border px-3 py-1.5 text-sm font-semibold transition-colors';

  const choiceBtn = (value: string, label: string, activeClass: string) => (
    <label
      key={value}
      className={`${choiceBaseClassName} ${
        statusValue === value
          ? activeClass
          : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]/40'
      }`}
    >
      <input type="radio" value={value} {...register(`itens.${index}.status`)} className="hidden" />
      {label}
    </label>
  );

  return (
    <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 p-4 transition-colors hover:border-[var(--ds-color-warning-border)]">
      <div className="mb-3 flex items-start justify-between gap-3">
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
        <div className="ml-2">
          {(item.tipo_resposta === 'sim_nao_na' || !item.tipo_resposta) && (
            <div className="flex gap-2">
              {choiceBtn('sim', 'Sim', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
              {choiceBtn('nao', 'Não', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
              {choiceBtn('na', 'N/A', 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]')}
            </div>
          )}

          {item.tipo_resposta === 'sim_nao' && (
            <div className="flex gap-2">
              {choiceBtn('sim', 'Sim', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
              {choiceBtn('nao', 'Não', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
            </div>
          )}

          {item.tipo_resposta === 'conforme' && (
            <div className="flex gap-2">
              {choiceBtn('ok', 'Conforme', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
              {choiceBtn('nok', 'NC', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
              {choiceBtn('na', 'N/A', 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]')}
            </div>
          )}

          {/* texto e foto não usam botões de status */}
        </div>
      </div>

      {/* Texto livre */}
      {item.tipo_resposta === 'texto' && (
        <textarea
          {...register(`itens.${index}.resposta` as Parameters<typeof register>[0])}
          rows={3}
          placeholder="Resposta em texto livre..."
          className="mb-2 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
        />
      )}

      {/* Observação */}
      <div className="mt-2">
        <input
          {...register(`itens.${index}.observacao`)}
          placeholder={
            (statusValue === 'nok' || statusValue === 'nao')
              ? 'Observação obrigatória para Não Conformidade...'
              : 'Observações...'
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
