import { fireEvent, render, screen } from '@testing-library/react';
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
import { ExecutionItem } from './ExecutionItem';
import type { ChecklistFormData, ChecklistItemForm } from '../types';

const item = {
  item: 'Verificar proteção da máquina',
  tipo_resposta: 'sim_nao',
  peso: 1,
  obrigatorio: true,
  status: 'sim',
  fotos: [],
  subitens: [{ id: 'sub-1', texto: 'Grade lateral', ordem: 1, status: 'sim' }],
} as unknown as ChecklistItemForm;

describe('ExecutionItem', () => {
  it('identifica de forma contextual os botões de remover item e subitem', () => {
    const onRemove = jest.fn();
    const setValue = jest.fn() as unknown as UseFormSetValue<ChecklistFormData>;
    const register = jest.fn(() => ({})) as unknown as UseFormRegister<ChecklistFormData>;
    const watch = jest.fn((path: string) => {
      if (path.endsWith('.status')) return 'sim';
      if (path.endsWith('.fotos')) return [];
      if (path.endsWith('.subitens')) return item.subitens;
      return '';
    }) as unknown as UseFormWatch<ChecklistFormData>;

    render(
      <ExecutionItem
        item={item}
        index={2}
        register={register}
        watch={watch}
        setValue={setValue}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover item 3: Verificar proteção da máquina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover subitem A) do item 3: Grade lateral' }));
    expect(onRemove).toHaveBeenCalledWith(2);
    expect(setValue).toHaveBeenCalledWith('itens.2.subitens', [], expect.objectContaining({ shouldDirty: true }));
  });
});
