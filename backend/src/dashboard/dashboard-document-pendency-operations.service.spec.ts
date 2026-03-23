import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DashboardDocumentPendencyOperationsService } from './dashboard-document-pendency-operations.service';

describe('DashboardDocumentPendencyOperationsService', () => {
  const aprsService = {
    getPdfAccess: jest.fn(),
  };
  const auditsService = {
    getPdfAccess: jest.fn(),
  };
  const catsService = {
    getPdfAccess: jest.fn(),
    getAttachmentAccess: jest.fn(),
  };
  const checklistsService = {
    getPdfAccess: jest.fn(),
  };
  const ddsService = {
    getPdfAccess: jest.fn(),
    getVideoAttachmentAccess: jest.fn(),
  };
  const documentImportService = {
    retryDocumentProcessing: jest.fn(),
  };
  const inspectionsService = {
    getPdfAccess: jest.fn(),
    getVideoAttachmentAccess: jest.fn(),
  };
  const nonConformitiesService = {
    getPdfAccess: jest.fn(),
    getAttachmentAccess: jest.fn(),
  };
  const ptsService = {
    getPdfAccess: jest.fn(),
  };
  const rdosService = {
    getPdfAccess: jest.fn(),
    getVideoAttachmentAccess: jest.fn(),
  };

  let service: DashboardDocumentPendencyOperationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardDocumentPendencyOperationsService(
      aprsService as never,
      auditsService as never,
      catsService as never,
      checklistsService as never,
      ddsService as never,
      documentImportService as never,
      inspectionsService as never,
      nonConformitiesService as never,
      ptsService as never,
      rdosService as never,
    );
  });

  it('resolve final pdf uses the official module service when permission is valid', async () => {
    ptsService.getPdfAccess.mockResolvedValue({
      availability: 'ready',
      message: null,
      url: 'https://storage.example.test/pt.pdf',
      originalName: 'pt.pdf',
    });

    const result = await service.resolveAction({
      actionKey: 'open_final_pdf',
      module: 'pt',
      documentId: 'pt-1',
      permissions: ['can_view_pt'],
    });

    expect(result).toEqual({
      actionKey: 'open_final_pdf',
      availability: 'ready',
      message: null,
      url: 'https://storage.example.test/pt.pdf',
      fileName: 'pt.pdf',
      fileType: 'application/pdf',
    });
    expect(ptsService.getPdfAccess).toHaveBeenCalledWith('pt-1');
  });

  it('blocks pendency resolution without backend permission', async () => {
    await expect(
      service.resolveAction({
        actionKey: 'open_final_pdf',
        module: 'pt',
        documentId: 'pt-1',
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires attachment id for governed video resolution', async () => {
    await expect(
      service.resolveAction({
        actionKey: 'open_governed_video',
        module: 'dds',
        documentId: 'dds-1',
        permissions: ['can_view_dds'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reenqueues import only with explicit permission', async () => {
    documentImportService.retryDocumentProcessing.mockResolvedValue({
      documentId: 'import-1',
      status: 'QUEUED',
      message: 'Importação reenfileirada.',
    });

    await expect(
      service.retryImport('import-1', {
        actorId: 'user-1',
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const result = await service.retryImport('import-1', {
      actorId: 'user-1',
      permissions: ['can_import_documents'],
    });

    expect(result).toMatchObject({
      documentId: 'import-1',
      status: 'QUEUED',
    });
    expect(documentImportService.retryDocumentProcessing).toHaveBeenCalledWith(
      'import-1',
      'user-1',
    );
  });
});
