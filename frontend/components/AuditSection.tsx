import { FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { User } from '@/services/usersService';

interface AuditFields {
  auditado_por_id?: string;
  data_auditoria?: string;
  resultado_auditoria?: string;
  notas_auditoria?: string;
}

interface AuditSectionProps<T extends AuditFields & FieldValues> {
  register: UseFormRegister<T>;
  auditors: User[];
  disabled?: boolean;
}

export function AuditSection<T extends AuditFields & FieldValues>({ register, auditors, disabled }: AuditSectionProps<T>) {
  return (
    <div className="ds-form-page rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Seção de Auditoria</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="auditado_por_id" className="block text-sm font-medium text-gray-700">Auditado por</label>
          <select
            id="auditado_por_id"
            {...register('auditado_por_id' as Path<T>)}
            disabled={disabled}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
              disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300' : 'border-gray-300 focus:border-blue-500'
            }`}
          >
            <option value="">{disabled ? 'Selecione uma empresa primeiro' : 'Selecione um auditor'}</option>
            {auditors.map(user => (
              <option key={user.id} value={user.id}>{user.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="data_auditoria" className="block text-sm font-medium text-gray-700">Data da Auditoria</label>
          <input
            id="data_auditoria"
            type="date"
            {...register('data_auditoria' as Path<T>)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="resultado_auditoria" className="block text-sm font-medium text-gray-700">Resultado da Auditoria</label>
          <select
            id="resultado_auditoria"
            {...register('resultado_auditoria' as Path<T>)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Selecione o resultado</option>
            <option value="Conforme">Conforme</option>
            <option value="Não Conforme">Não Conforme</option>
            <option value="Observação">Observação</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="notas_auditoria" className="block text-sm font-medium text-gray-700">Notas da Auditoria</label>
          <textarea
            id="notas_auditoria"
            {...register('notas_auditoria' as Path<T>)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="Observações adicionais da auditoria..."
          />
        </div>
      </div>
    </div>
  );
}
