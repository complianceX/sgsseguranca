import { render, screen } from '@testing-library/react';
import { SgsInsights } from './SgsInsights';

const getInsights = jest.fn();

jest.mock('@/services/aiService', () => ({
  aiService: {
    getInsights: (...args: unknown[]) => getInsights(...args),
  },
}));

describe('SgsInsights', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getInsights.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('prioritizes one main insight and keeps the rest compact', async () => {
    getInsights.mockResolvedValue({
      summary: 'Resumo assistido para a operação.',
      timestamp: '2026-03-15T12:00:00.000Z',
      insights: [
        {
          type: 'warning',
          title: 'Pendência crítica de PT',
          message: 'Há uma PT aguardando assinatura final.',
          action: '/dashboard/pts',
        },
        {
          type: 'info',
          title: 'Treinamento próximo do vencimento',
          message: 'NR-35 vence esta semana.',
          action: '/dashboard/trainings',
        },
        {
          type: 'success',
          title: 'Checklist atualizado',
          message: 'Checklist operacional revisado hoje.',
          action: '/dashboard/checklists',
        },
        {
          type: 'info',
          title: 'Insight adicional',
          message: 'Mais um ponto disponível no workspace.',
          action: '/dashboard/sst-agent',
        },
      ],
    });

    render(<SgsInsights />);

    expect(await screen.findByText('Pendência crítica de PT')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento próximo do vencimento')).not.toBeInTheDocument();
    expect(screen.getByText('Checklist atualizado')).toBeInTheDocument();
    expect(
      screen.queryByText(/\+1 insight disponível no workspace assistido/i),
    ).not.toBeInTheDocument();
  });

  it('shows the fallback state when insights fail to load', async () => {
    getInsights.mockRejectedValue(new Error('fail'));

    render(<SgsInsights />);

    expect(await screen.findByText(/sophie indisponível neste carregamento/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir workspace assistido/i })).toBeInTheDocument();
  });
});
