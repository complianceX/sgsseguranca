import { FieldValues, Path, UseFormRegister } from 'react-hook-form';
import type { User } from '@/services/usersService';

interface AuditFields {
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
}

interface AuditSectionProps<T extends AuditFields & FieldValues> {
  register: UseFormRegister<T>;
  auditors: Array<Pick<User, 'id' | 'nome'>>;
  disabled?: boolean;
}

export function AuditSection<T extends AuditFields & FieldValues>({ register, auditors, disabled }: AuditSectionProps<T>) {
  return (
    <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--ds-color-surface-base)_94%,white_6%)_0%,var(--ds-color-surface-base)_100%)] p-5 shadow-[var(--ds-shadow-xs)]">
      <div className="mb-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
          Seção de auditoria
        </p>
        <h2 className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
          Rastreabilidade e conformidade
        </h2>
        <p className="text-sm text-[var(--ds-color-text-secondary)]">
          Preencha este bloco somente quando houver auditoria formal do treinamento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="auditado_por_id" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Auditado por
          </label>
          <select
            id="auditado_por_id"
            {...register('auditado_por_id' as Path<T>)}
            disabled={disabled}
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--ds-shadow-sm)] disabled:cursor-not-allowed disabled:bg-[var(--ds-color-surface-muted)]"
          >
            <option value="">{disabled ? 'Selecione uma empresa primeiro' : 'Selecione um auditor'}</option>
            {auditors.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="data_auditoria" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Data da auditoria
          </label>
          <input
            id="data_auditoria"
            type="date"
            {...register('data_auditoria' as Path<T>)}
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--ds-shadow-sm)]"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="resultado_auditoria" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Resultado da auditoria
          </label>
          <select
            id="resultado_auditoria"
            {...register('resultado_auditoria' as Path<T>)}
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--ds-shadow-sm)]"
          >
            <option value="">Selecione o resultado</option>
            <option value="Conforme">Conforme</option>
            <option value="Não Conforme">Não Conforme</option>
            <option value="Observação">Observação</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label htmlFor="notas_auditoria" className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Notas da auditoria
          </label>
          <textarea
            id="notas_auditoria"
            {...register('notas_auditoria' as Path<T>)}
            rows={3}
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-action-primary)] focus:outline-none focus:shadow-[var(--ds-shadow-sm)]"
            placeholder="Observações adicionais da auditoria..."
          />
        </div>
      </div>
    </section>
  );
}
