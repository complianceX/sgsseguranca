import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { AuthProvider } from "@/context/AuthContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// O dashboard carrega um grafo grande de componentes e este teste já apresentou
// intermitência por tempo de inicialização fora do escopo funcional das features
// correntes. Mantemos a cobertura e apenas damos folga adicional ao runner.
jest.setTimeout(30000);

jest.mock("@/context/AuthContext", () => ({
  AuthProvider: ({ children }: PropsWithChildren) => children,
  useAuth: () => ({
    user: { nome: "Usuário Teste" },
    loading: false,
    roles: [],
    permissions: [],
    isAdminGeral: false,
    hasPermission: () => false,
    login: jest.fn(),
    finalizeLogin: jest.fn(),
    logout: jest.fn(),
  }),
}));

const getSummary = jest.fn();
const getPendingQueue = jest.fn();
jest.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getSummary: (...args: unknown[]) => getSummary(...args),
    getPendingQueue: (...args: unknown[]) => getPendingQueue(...args),
  },
}));

jest.mock("@/services/sitesService", () => ({
  sitesService: {
    findPaginated: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

describe("DashboardPage", () => {
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
        { id: "epi-1", nome: "Capacete", ca: "123", validade_ca: "2025-01-01" },
      ],
      expiringTrainings: [
        {
          id: "train-1",
          nome: "NR-35",
          data_vencimento: "2025-01-01",
          user: { nome: "Carlos" },
        },
      ],
      pendingApprovals: {
        aprs: 2,
        pts: 1,
        checklists: 3,
        nonconformities: 1,
      },
      actionPlanItems: [],
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
      recentActivities: [],
      siteCompliance: [],
      recentReports: [],
    });

    getPendingQueue.mockResolvedValue({
      degraded: false,
      failedSources: [],
      summary: {
        total: 3,
        totalFound: 3,
        hasMore: false,
        critical: 1,
        high: 1,
        medium: 1,
        documents: 2,
        health: 1,
        actions: 0,
        slaBreached: 0,
        slaDueToday: 0,
        slaDueSoon: 0,
      },
      items: [],
    });
  });

  it("reorganiza o dashboard com hero, ações prioritárias, KPIs e fila operacional", async () => {
    const { default: DashboardPage } = await import("./page");
    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    );

    expect(await screen.findByText(/painel operacional/i)).toBeInTheDocument();
    expect(await screen.findByText(/ações prioritárias/i)).toBeInTheDocument();
    expect(await screen.findByText(/conformidade geral/i)).toBeInTheDocument();
    expect(await screen.findByText(/fila de prioridades/i)).toBeInTheDocument();
    const complianceLabels = await screen.findAllByText(/controlado/i);
    expect(complianceLabels.length).toBeGreaterThan(0);
    expect(await screen.findByText("83%")).toBeInTheDocument();

    expect(screen.queryByText(/acesso rápido aos módulos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^acesso rápido$/i)).not.toBeInTheDocument();
  });
});
