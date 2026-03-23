import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getDocumentPendencies = jest.fn();
const resolveDocumentPendencyAction = jest.fn();
const retryDocumentPendencyImport = jest.fn();
const findPaginatedCompanies = jest.fn();
const findAllSites = jest.fn();
const useAuth = jest.fn();
const subscribe = jest.fn(() => jest.fn());
const push = jest.fn();

jest.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getDocumentPendencies: (...args: unknown[]) =>
      getDocumentPendencies(...args),
    resolveDocumentPendencyAction: (...args: unknown[]) =>
      resolveDocumentPendencyAction(...args),
    retryDocumentPendencyImport: (...args: unknown[]) =>
      retryDocumentPendencyImport(...args),
  },
}));

jest.mock("@/services/companiesService", () => ({
  companiesService: {
    findPaginated: (...args: unknown[]) => findPaginatedCompanies(...args),
  },
}));

jest.mock("@/services/sitesService", () => ({
  sitesService: {
    findAll: (...args: unknown[]) => findAllSites(...args),
  },
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuth(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
  }),
}));

jest.mock("@/lib/selectedTenantStore", () => ({
  selectedTenantStore: {
    get: () => ({
      companyId: "company-1",
      companyName: "Empresa Demo",
    }),
    subscribe: (...args: unknown[]) => subscribe(...args),
  },
}));

describe("DocumentPendenciesPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "open", {
      writable: true,
      value: jest.fn(),
    });
    useAuth.mockReturnValue({
      isAdminGeral: false,
    });
    findPaginatedCompanies.mockResolvedValue({
      data: [
        {
          id: "company-1",
          razao_social: "Empresa Demo",
        },
      ],
    });
    findAllSites.mockResolvedValue([
      {
        id: "site-1",
        nome: "Obra Centro",
        company_id: "company-1",
      },
    ]);
    getDocumentPendencies.mockResolvedValue({
      degraded: false,
      failedSources: [],
      summary: {
        total: 2,
        byCriticality: {
          critical: 1,
          high: 1,
          medium: 0,
          low: 0,
        },
        byType: [
          {
            type: "missing_final_pdf",
            label: "Sem PDF final governado",
            total: 1,
          },
          {
            type: "failed_import",
            label: "Importação falhada",
            total: 1,
          },
        ],
        byModule: [
          {
            module: "apr",
            label: "APR",
            total: 1,
          },
          {
            module: "document-import",
            label: "Importação documental",
            total: 1,
          },
        ],
      },
      filtersApplied: {
        companyId: "company-1",
      },
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        lastPage: 1,
      },
      items: [
        {
          id: "missing_final_pdf:apr:apr-1",
          type: "missing_final_pdf",
          typeLabel: "Sem PDF final governado",
          module: "apr",
          moduleLabel: "APR",
          companyId: "company-1",
          companyName: "Empresa Demo",
          siteId: "site-1",
          siteName: "Obra Centro",
          documentId: "apr-1",
          documentCode: "APR-001",
          title: "APR Escavação",
          status: "Aprovada",
          documentStatus: "Aprovada",
          signatureStatus: null,
          availabilityStatus: "not_emitted",
          criticality: "critical",
          priority: "critical",
          relevantDate: "2026-03-21T10:00:00.000Z",
          message:
            "APR aprovada sem PDF final governado. O fechamento oficial ainda não foi concluído.",
          action: {
            label: "Emitir PDF final",
            href: "/dashboard/aprs/edit/apr-1",
          },
          allowedActions: [
            {
              key: "open_document",
              label: "Emitir PDF final",
              kind: "route",
              enabled: true,
              href: "/dashboard/aprs/edit/apr-1",
            },
            {
              key: "open_final_pdf",
              label: "Abrir PDF final",
              kind: "resolve",
              enabled: false,
              reason:
                "O PDF final governado ainda não foi emitido para este documento.",
            },
          ],
          suggestedRoute: "/dashboard/aprs/edit/apr-1",
          suggestedRouteParams: {
            documentId: "apr-1",
            siteId: "site-1",
            module: "apr",
          },
          publicValidationUrl: null,
          retryAllowed: false,
          replacementDocumentId: null,
          replacementRoute: null,
          metadata: {},
        },
        {
          id: "degraded_document_availability:pt:pt-1",
          type: "degraded_document_availability",
          typeLabel: "Disponibilidade degradada",
          module: "pt",
          moduleLabel: "PT",
          companyId: "company-1",
          companyName: "Empresa Demo",
          siteId: null,
          siteName: null,
          documentId: "pt-1",
          documentCode: "PT-001",
          title: "PT Trabalho em altura",
          status: "Aprovada",
          documentStatus: "Aprovada",
          signatureStatus: "signed",
          availabilityStatus: "registered_without_signed_url",
          criticality: "high",
          priority: "high",
          relevantDate: "2026-03-20T09:00:00.000Z",
          message: "PDF final registrado, mas sem URL assinada disponível.",
          action: {
            label: "Abrir PT",
            href: "/dashboard/pts/edit/pt-1",
          },
          allowedActions: [
            {
              key: "open_document",
              label: "Abrir PT",
              kind: "route",
              enabled: true,
              href: "/dashboard/pts/edit/pt-1",
            },
            {
              key: "open_final_pdf",
              label: "Tentar abrir PDF final",
              kind: "resolve",
              enabled: true,
            },
          ],
          suggestedRoute: "/dashboard/pts/edit/pt-1",
          suggestedRouteParams: {
            documentId: "pt-1",
            siteId: null,
            module: "pt",
          },
          publicValidationUrl: "/verify?code=PT-001",
          retryAllowed: false,
          replacementDocumentId: null,
          replacementRoute: null,
          metadata: {},
        },
        {
          id: "failed_import:document-import:import-1",
          type: "failed_import",
          typeLabel: "Importação falhada",
          module: "document-import",
          moduleLabel: "Importação documental",
          companyId: "company-1",
          companyName: "Empresa Demo",
          siteId: null,
          siteName: null,
          documentId: "import-1",
          documentCode: "dds.pdf",
          title: "dds.pdf",
          status: "DEAD_LETTER",
          documentStatus: "DEAD_LETTER",
          signatureStatus: null,
          availabilityStatus: "failed",
          criticality: "high",
          priority: "high",
          relevantDate: "2026-03-20T09:00:00.000Z",
          message: "Arquivo inconsistente.",
          action: {
            label: "Abrir importação documental",
            href: "/dashboard/documentos/importar",
          },
          allowedActions: [
            {
              key: "open_document",
              label: "Abrir importação documental",
              kind: "route",
              enabled: true,
              href: "/dashboard/documentos/importar",
            },
            {
              key: "retry_import",
              label: "Reenfileirar importação",
              kind: "mutation",
              enabled: true,
            },
          ],
          suggestedRoute: "/dashboard/documentos/importar",
          suggestedRouteParams: {
            documentId: "import-1",
            siteId: null,
            module: "document-import",
          },
          publicValidationUrl: null,
          retryAllowed: true,
          replacementDocumentId: null,
          replacementRoute: null,
          metadata: {
            importId: "import-1",
          },
        },
      ],
    });
    resolveDocumentPendencyAction.mockResolvedValue({
      actionKey: "open_final_pdf",
      url: "https://storage.example.test/pt.pdf",
      availability: "ready",
      message: null,
      fileName: "pt.pdf",
      fileType: "application/pdf",
    });
    retryDocumentPendencyImport.mockResolvedValue({
      documentId: "import-1",
      status: "QUEUED",
      message: "Importação reenfileirada.",
    });
  });

  it("renders summary cards and operational rows", async () => {
    const { default: DocumentPendenciesPage } = await import("./page");

    render(<DocumentPendenciesPage />);

    expect(
      await screen.findByText(/central de pendências documentais/i),
    ).toBeInTheDocument();
    expect(await screen.findByText("APR Escavação")).toBeInTheDocument();
    expect(
      await screen.findByText(/arquivo inconsistente/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/pendências totais/i)).toBeInTheDocument();
    expect(await screen.findByText(/críticas/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /emitir pdf final/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /validar documento/i }),
    ).toBeInTheDocument();
  }, 15000);

  it("runs resolve and retry actions from the operational table", async () => {
    const { default: DocumentPendenciesPage } = await import("./page");

    render(<DocumentPendenciesPage />);

    const openPdfButton = await screen.findByRole("button", {
      name: /tentar abrir pdf final/i,
    });
    fireEvent.click(openPdfButton);

    await waitFor(() =>
      expect(resolveDocumentPendencyAction).toHaveBeenCalledWith({
        actionKey: "open_final_pdf",
        module: "pt",
        documentId: "pt-1",
        attachmentId: undefined,
        attachmentIndex: undefined,
      }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "https://storage.example.test/pt.pdf",
      "_blank",
      "noopener,noreferrer",
    );

    const retryButton = await screen.findByRole("button", {
      name: /reenfileirar importação/i,
    });
    const callCountBeforeRetry = getDocumentPendencies.mock.calls.length;

    fireEvent.click(retryButton);

    await waitFor(() =>
      expect(retryDocumentPendencyImport).toHaveBeenCalledWith("import-1"),
    );
    await waitFor(() =>
      expect(getDocumentPendencies.mock.calls.length).toBeGreaterThan(
        callCountBeforeRetry,
      ),
    );
  }, 15000);
});
