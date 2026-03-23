import 'reflect-metadata';

import { DashboardController } from '../dashboard/dashboard.controller';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = 'company-1';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('Dashboard document pendencies smoke', () => {
  it('lists operational pendencies with actions and resolves secure operations through the dashboard controller', async () => {
    const dashboardService = {
      getDocumentPendencies: jest.fn().mockResolvedValue({
        degraded: false,
        failedSources: [],
        summary: {
          total: 1,
          byCriticality: {
            critical: 1,
            high: 0,
            medium: 0,
            low: 0,
          },
          byType: [
            {
              type: 'degraded_document_availability',
              label: 'Disponibilidade degradada',
              total: 1,
            },
          ],
          byModule: [{ module: 'pt', label: 'PT', total: 1 }],
        },
        filtersApplied: {
          companyId: COMPANY_ID,
        },
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          lastPage: 1,
        },
        items: [
          {
            id: 'degraded_document_availability:pt:pt-1',
            type: 'degraded_document_availability',
            typeLabel: 'Disponibilidade degradada',
            module: 'pt',
            moduleLabel: 'PT',
            companyId: COMPANY_ID,
            companyName: 'Empresa Demo',
            siteId: null,
            siteName: null,
            documentId: DOCUMENT_ID,
            documentCode: 'PT-001',
            title: 'PT teste',
            status: 'Aprovada',
            documentStatus: 'Aprovada',
            signatureStatus: 'signed',
            availabilityStatus: 'registered_without_signed_url',
            criticality: 'critical',
            priority: 'critical',
            relevantDate: '2026-03-23T10:00:00.000Z',
            message:
              'PDF governado registrado, mas indisponível por signed URL.',
            action: {
              label: 'Abrir PT',
              href: `/dashboard/pts/edit/${DOCUMENT_ID}`,
            },
            allowedActions: [
              {
                key: 'open_document',
                label: 'Abrir PT',
                kind: 'route',
                enabled: true,
                href: `/dashboard/pts/edit/${DOCUMENT_ID}`,
              },
              {
                key: 'open_final_pdf',
                label: 'Tentar abrir PDF final',
                kind: 'resolve',
                enabled: true,
              },
            ],
            suggestedRoute: `/dashboard/pts/edit/${DOCUMENT_ID}`,
            suggestedRouteParams: {
              module: 'pt',
              documentId: DOCUMENT_ID,
              siteId: null,
            },
            publicValidationUrl: '/verify?code=PT-001',
            retryAllowed: false,
            replacementDocumentId: null,
            replacementRoute: null,
            metadata: {},
          },
        ],
      }),
      resolveDocumentPendencyAction: jest.fn().mockResolvedValue({
        actionKey: 'open_final_pdf',
        url: 'https://storage.example.test/pt.pdf',
        availability: 'ready',
        message: null,
        fileName: 'pt.pdf',
        fileType: 'application/pdf',
      }),
      retryDocumentPendencyImport: jest.fn().mockResolvedValue({
        documentId: DOCUMENT_ID,
        status: 'QUEUED',
      }),
    };

    const controller = new DashboardController(dashboardService as never);

    const listResponse = await controller.getDocumentPendencies(
      {
        user: {
          userId: USER_ID,
          company_id: COMPANY_ID,
          permissions: ['can_view_dashboard', 'can_view_pt'],
          profile: { nome: 'Administrador' },
        },
        tenant: { companyId: COMPANY_ID },
      } as never,
      {
        companyId: COMPANY_ID,
        page: '1',
        limit: '20',
      },
    );

    const resolveResponse = await controller.resolveDocumentPendencyAction(
      {
        user: {
          userId: USER_ID,
          company_id: COMPANY_ID,
          permissions: ['can_view_dashboard', 'can_view_pt'],
        },
        tenant: { companyId: COMPANY_ID },
      } as never,
      {
        actionKey: 'open_final_pdf',
        module: 'pt',
        documentId: DOCUMENT_ID,
      },
    );

    expect(listResponse.summary.total).toBe(1);
    expect(listResponse.items[0]).toMatchObject({
      type: 'degraded_document_availability',
      module: 'pt',
      documentId: DOCUMENT_ID,
    });
    expect(resolveResponse).toEqual({
      actionKey: 'open_final_pdf',
      url: 'https://storage.example.test/pt.pdf',
      availability: 'ready',
      message: null,
      fileName: 'pt.pdf',
      fileType: 'application/pdf',
    });
    expect(dashboardService.getDocumentPendencies).toHaveBeenCalled();
    expect(dashboardService.resolveDocumentPendencyAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'open_final_pdf',
        module: 'pt',
        documentId: DOCUMENT_ID,
        actorId: USER_ID,
        companyId: COMPANY_ID,
      }),
    );
  });

  it('delegates import retry through the secured controller endpoint', async () => {
    const dashboardService = {
      retryDocumentPendencyImport: jest.fn().mockResolvedValue({
        documentId: DOCUMENT_ID,
        status: 'QUEUED',
        message: 'Importação reenfileirada.',
      }),
    };

    const controller = new DashboardController(dashboardService as never);
    const response = await controller.retryDocumentPendencyImport(
      {
        user: {
          userId: USER_ID,
          permissions: ['can_import_documents'],
        },
      } as never,
      DOCUMENT_ID,
    );

    expect(response).toMatchObject({
      documentId: DOCUMENT_ID,
      status: 'QUEUED',
    });
    expect(dashboardService.retryDocumentPendencyImport).toHaveBeenCalledWith({
      documentId: DOCUMENT_ID,
      actorId: USER_ID,
      permissions: ['can_import_documents'],
    });
  });
});
