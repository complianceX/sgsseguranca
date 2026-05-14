import { render, screen } from '@testing-library/react';
import { SgsInsights } from './SgsInsights';

const getInsights = jest.fn();

jest.mock('@/services/aiService', () => ({
  aiService: {
    getInsights: (...args: unknown[]) => getInsights(...args),
  },
}));

jest.mock('@/hooks/useCachedFetch', () => ({
  useCachedFetch: (
    key: string,
    fetcher: (...args: unknown[]) => Promise<unknown> | unknown,
  ) => ({
    fetch: fetcher,
    invalidate: jest.fn(),
    invalidateAll: jest.fn(),
  }),
}));

describe('SgsInsights', () => {
  let consoleErrorSpy: jest.SpyInstance;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NEXT_PUBLIC_FEATURE_AI_ENABLED: 'true' };
    getInsights.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
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
    expect(await screen.findByText('Treinamento próximo do vencimento')).toBeInTheDocument();
    expect(screen.getByText('Checklist atualizado')).toBeInTheDocument();
    expect(
      screen.queryByText(/\+1 insight disponível no workspace assistido/i),
    ).toBeInTheDocument();
  });

  it('shows the fallback state when insights fail to load', async () => {
    getInsights.mockRejectedValue(new Error('fail'));

    render(<SgsInsights />);

    expect(await screen.findByText(/sophie indisponível neste carregamento/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir workspace assistido/i })).toBeInTheDocument();
  });

  it('blocks external or protocol-based insight actions', async () => {
    getInsights.mockResolvedValue({
      summary: 'Resumo assistido para a operação.',
      timestamp: '2026-03-15T12:00:00.000Z',
      insights: [
        {
          type: 'warning',
          title: 'Link externo',
          message: 'Não deve aparecer.',
          action: 'https://evil.example/dashboard',
        },
        {
          type: 'info',
          title: 'Link javascript',
          message: 'Não deve aparecer.',
          action: 'javascript:alert(1)',
        },
        {
          type: 'success',
          title: 'Link interno seguro',
          message: 'Deve aparecer.',
          action: '/dashboard/checklists',
        },
      ],
    });

    render(<SgsInsights />);

    expect(await screen.findByText('Link interno seguro')).toBeInTheDocument();
    expect(screen.queryByText('Link externo')).not.toBeInTheDocument();
    expect(screen.queryByText('Link javascript')).not.toBeInTheDocument();
  });
});
