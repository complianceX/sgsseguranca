import { fireEvent, render, screen } from '@testing-library/react';
import { RisksTable } from './RisksTable';
import { Risk } from '@/services/risksService';

function installMatchMedia(desktop: boolean) {
  const mediaQuery = {
    matches: desktop,
    media: '(min-width: 768px)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = jest.fn(() => mediaQuery);
}

const risk: Risk = {
  id: 'risk-1',
  nome: 'Ruído contínuo',
  categoria: 'Físico',
  descricao: 'Exposição durante a operação',
  company_id: 'company-1',
  status: true,
  created_at: '2026-07-10T12:00:00.000Z',
  updated_at: '2026-07-10T12:00:00.000Z',
};

describe('RisksTable responsive representation', () => {
  it('renderiza card mobile sem montar a tabela e mantém ações nomeadas', () => {
    installMatchMedia(false);
    const onDelete = jest.fn();

    render(<RisksTable risks={[risk]} loading={false} onDelete={onDelete} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ações do risco Ruído contínuo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /editar/i })).toHaveAttribute('href', '/dashboard/risks/edit/risk-1');

    fireEvent.click(screen.getByRole('button', { name: /excluir/i }));
    expect(onDelete).toHaveBeenCalledWith('risk-1');
  });

  it('preserva a tabela no desktop sem montar o card mobile', () => {
    installMatchMedia(true);

    render(<RisksTable risks={[risk]} loading={false} onDelete={jest.fn()} />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('Ruído contínuo')).toBeInTheDocument();
  });
});
