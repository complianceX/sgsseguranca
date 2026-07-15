import { fireEvent, render, screen } from '@testing-library/react';
import { TrainingMobileCard } from './TrainingMobileCard';
import type { Training } from '@/services/trainingsService';

const training = {
  id: 'training-1',
  nome: 'NR-10',
  data_conclusao: '2026-01-10',
  data_vencimento: '2027-01-10',
  user: { nome: 'Ana' },
} as Training;

describe('TrainingMobileCard', () => {
  it('expõe a ação de imprimir no mobile e encaminha o treinamento correto', () => {
    const onPrint = jest.fn();
    render(<TrainingMobileCard training={training} statusLabel="Válido" statusTone="success" busy={false} onPrint={onPrint} onDownload={jest.fn()} onEmail={jest.fn()} onDelete={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }));
    expect(onPrint).toHaveBeenCalledWith(training);
  });

  it('bloqueia as ações de documento enquanto o PDF está sendo preparado', () => {
    render(<TrainingMobileCard training={training} statusLabel="Válido" statusTone="success" busy onPrint={jest.fn()} onDownload={jest.fn()} onEmail={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'E-mail' })).toBeDisabled();
  });
});
