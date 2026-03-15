import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      nome: 'Administrador',
      company_id: 'company-1',
      company: { razao_social: 'Empresa Base' },
      profile: { nome: 'Administrador Geral' },
    },
    roles: ['Administrador Geral'],
    hasPermission: () => true,
  }),
}));

jest.mock('@/components/GandraInsights', () => ({
  GandraInsights: () => <div>Gandra Insights Mock</div>,
}));

jest.mock('recharts', () => {
  const MockChart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="chart">{children}</div>
    ),
    BarChart: MockChart,
    Bar: MockChart,
    LineChart: MockChart,
    Line: MockChart,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const getSummary = jest.fn();
const getPendingQueue = jest.fn();
const getMonthlyAnalytics = jest.fn();
const getInsights = jest.fn();

jest.mock('@/services/dashboardService', () => ({
  dashboardService: {
    getSummary: (...args: unknown[]) => getSummary(...args),
    getPendingQueue: (...args: unknown[]) => getPendingQueue(...args),
  },
}));

jest.mock('@/services/nonConformitiesService', () => ({
  nonConformitiesService: {
    getMonthlyAnalytics: (...args: unknown[]) => getMonthlyAnalytics(...args),
  },
}));

jest.mock('@/services/aiService', () => ({
  aiService: {
    getInsights: (...args: unknown[]) => getInsights(...args),
  },
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    getSummary.mockResolvedValue({
      counts: {
        users: 12,
        companies: 3,
        sites: 5,
        checklists: 8,
        aprs: 4,
        pts: 2,
      },
      expiringEpis: [
        { id: 'epi-1', nome: 'Capacete', ca: '123', validade_ca: '2025-01-01' },
      ],
      expiringTrainings: [
        {
          id: 'train-1',
          nome: 'NR-35',
          data_vencimento: '2025-01-01',
          user: { nome: 'Carlos' },
        },
      ],
      pendingApprovals: {
        aprs: 2,
        pts: 1,
        checklists: 3,
        nonconformities: 1,
      },
      actionPlanItems: [
        {
          id: 'action-1',
          source: 'Inspeção',
          title: 'Corrigir guarda-corpo',
          action: 'Isolar área',
          responsavel: 'Carlos',
          prazo: '2026-03-20',
          status: 'Pendente',
          href: '/dashboard/inspections',
        },
      ],
      riskSummary: {
        alto: 4,
        medio: 6,
        baixo: 10,
      },
      evidenceSummary: {
        total: 18,
        inspections: 10,
        nonconformities: 4,
        audits: 4,
      },
      modelCounts: {
        aprs: 5,
        dds: 3,
        checklists: 7,
      },
      recentActivities: [
        {
          id: 'pt-1',
          title: 'PT atualizada',
          description: 'Ajuste de bloqueio',
          date: '2026-03-15T10:00:00.000Z',
          href: '/dashboard/pts/edit/1',
          color: 'blue',
        },
      ],
      siteCompliance: [
        { id: 'site-1', nome: 'Obra Norte', total: 10, conformes: 8, taxa: 80 },
        { id: 'site-2', nome: 'Obra Sul', total: 8, conformes: 6, taxa: 75 },
      ],
      recentReports: [
        {
          id: 'report-1',
          titulo: 'Mensal SST',
          mes: 3,
          ano: 2026,
          created_at: '2026-03-15T09:00:00.000Z',
        },
      ],
    });

    getPendingQueue.mockResolvedValue({
      summary: {
        total: 3,
        critical: 1,
        high: 1,
        medium: 1,
        documents: 2,
        health: 1,
        actions: 0,
      },
      items: [],
    });

    getMonthlyAnalytics.mockResolvedValue([
      { mes: '2026-02-01', total: 2 },
      { mes: '2026-03-01', total: 4 },
    ]);

    getInsights.mockResolvedValue({ safetyScore: 84 });
  });

  it('renders the new consolidated lower dashboard sections', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText(/vencimentos críticos/i)).toBeInTheDocument();
    expect(screen.getByText(/síntese executiva/i)).toBeInTheDocument();
    expect(screen.getByText(/indicadores sst/i)).toBeInTheDocument();
    expect(screen.getByText(/plano de ação/i)).toBeInTheDocument();
    expect(screen.getByText(/gandra insights mock/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Aprovação e Assinaturas')).not.toBeInTheDocument();
      expect(screen.queryByText('Status de Treinamentos')).not.toBeInTheDocument();
      expect(screen.queryByText(/benchmark de conformidade por obra/i)).not.toBeInTheDocument();
    });
  });
});
