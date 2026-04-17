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

jest.mock("@/lib/temporarilyHiddenModules", () => ({
  isTemporarilyVisibleDashboardRoute: () => true,
}));

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
  });

  it("renders only the compliance score view and hides removed dashboard blocks", async () => {
    const { default: DashboardPage } = await import("./page");
    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    );

    expect(await screen.findByText(/score de conformidade/i)).toBeInTheDocument();
    expect(await screen.findByText(/conformidade geral/i)).toBeInTheDocument();
    const complianceLabels = await screen.findAllByText(/controlado/i);
    expect(complianceLabels.length).toBeGreaterThan(0);
    expect(await screen.findByText("83%")).toBeInTheDocument();

    expect(screen.queryByText(/centro operacional sst/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fila central de pendências/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/alertas críticos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/suporte sst/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sophie/i)).not.toBeInTheDocument();
  });
});
