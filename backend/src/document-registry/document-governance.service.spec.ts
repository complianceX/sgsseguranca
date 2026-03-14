import { DataSource, EntityManager } from 'typeorm';
import { DocumentGovernanceService } from './document-governance.service';
import type { PdfService } from '../common/services/pdf.service';
import type { DocumentRegistryService } from './document-registry.service';

describe('DocumentGovernanceService', () => {
  let service: DocumentGovernanceService;
  let dataSource: Pick<DataSource, 'transaction'>;
  let manager: EntityManager;
  let pdfService: Pick<PdfService, 'computeHash' | 'registerHashIntegrity'>;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'upsertWithManager' | 'removeWithManager' | 'findByDocument'
  >;

  beforeEach(() => {
    manager = {} as EntityManager;
    dataSource = {
      transaction: jest.fn(
        async (cb: (tx: EntityManager) => Promise<unknown>) => cb(manager),
      ),
    };
    pdfService = {
      computeHash: jest.fn(() => 'abc123'),
      registerHashIntegrity: jest.fn(),
    };
    documentRegistryService = {
      upsertWithManager: jest.fn(),
      removeWithManager: jest.fn(),
      findByDocument: jest.fn(),
    };

    service = new DocumentGovernanceService(
      dataSource as DataSource,
      pdfService as PdfService,
      documentRegistryService as DocumentRegistryService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registra integridade e registry no mesmo bloco transacional', async () => {
    const persistEntityMetadata = jest.fn();
    const registryEntry = {
      id: 'registry-1',
      file_hash: 'abc123',
      file_key: 'documents/company-1/checklists/doc.pdf',
    };
    (documentRegistryService.upsertWithManager as jest.Mock).mockResolvedValue(
      registryEntry,
    );

    await expect(
      service.registerFinalDocument({
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        title: 'Checklist de campo',
        documentDate: '2026-03-14',
        fileKey: 'documents/company-1/checklists/doc.pdf',
        folderPath: 'documents/company-1/checklists',
        originalName: 'checklist.pdf',
        mimeType: 'application/pdf',
        fileBuffer: Buffer.from('%PDF-governed'),
        createdBy: 'user-1',
        persistEntityMetadata,
      }),
    ).resolves.toEqual({
      hash: 'abc123',
      registryEntry,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(pdfService.computeHash).toHaveBeenCalledWith(
      Buffer.from('%PDF-governed'),
    );
    expect(persistEntityMetadata).toHaveBeenCalledWith(manager, 'abc123');
    expect(pdfService.registerHashIntegrity).toHaveBeenCalledWith(
      'abc123',
      expect.objectContaining({
        originalName: 'checklist.pdf',
        recordedByUserId: 'user-1',
        companyId: 'company-1',
      }),
      { manager },
    );
    expect(documentRegistryService.upsertWithManager).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        fileHash: 'abc123',
      }),
    );
  });

  it('propaga a falha do bloco relacional sem deixar o erro silencioso', async () => {
    const loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation();
    const failure = new Error('registry failed');
    (documentRegistryService.upsertWithManager as jest.Mock).mockRejectedValue(
      failure,
    );

    await expect(
      service.registerFinalDocument({
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        title: 'Checklist de campo',
        fileKey: 'documents/company-1/checklists/doc.pdf',
        fileBuffer: Buffer.from('%PDF-governed'),
      }),
    ).rejects.toThrow('registry failed');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao registrar governança documental'),
      failure.stack,
    );
  });

  it('remove registry em transação e preserva a política de rastreabilidade da integridade', async () => {
    const removeEntityState = jest.fn();
    const loggerDebug = jest
      .spyOn(service['logger'], 'debug')
      .mockImplementation();

    await service.removeFinalDocumentReference({
      companyId: 'company-1',
      module: 'checklist',
      entityId: 'checklist-1',
      removeEntityState,
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(removeEntityState).toHaveBeenCalledWith(manager);
    expect(documentRegistryService.removeWithManager).toHaveBeenCalledWith(
      manager,
      {
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        documentType: undefined,
      },
    );
    expect(loggerDebug).toHaveBeenCalledWith(
      expect.stringContaining('registro de integridade preservado'),
    );
  });

  it('resolve contexto de assinatura a partir do registry governado', async () => {
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-22',
      document_code: 'CHECKLIST-2026-11-ABCD1234',
      file_hash: 'known-hash',
      file_key: 'documents/company-1/checklists/doc.pdf',
    });

    await expect(
      service.findRegistryContextForSignature(
        'checklist-1',
        'CHECKLIST',
        'company-1',
      ),
    ).resolves.toEqual({
      registryEntryId: 'registry-22',
      documentCode: 'CHECKLIST-2026-11-ABCD1234',
      fileHash: 'known-hash',
      fileKey: 'documents/company-1/checklists/doc.pdf',
      module: 'checklist',
    });

    expect(documentRegistryService.findByDocument).toHaveBeenCalledWith(
      'checklist',
      'checklist-1',
      'pdf',
      'company-1',
    );
  });

  it('mantem o mapeamento centralizado para auditoria sem perder contexto', async () => {
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-audit',
      document_code: 'AUDIT-2026-11-ABCD1234',
      file_hash: 'audit-hash',
      file_key: 'documents/company-1/audits/doc.pdf',
    });

    await expect(
      service.findRegistryContextForSignature(
        'audit-1',
        'AUDITORIA',
        'company-1',
      ),
    ).resolves.toEqual({
      registryEntryId: 'registry-audit',
      documentCode: 'AUDIT-2026-11-ABCD1234',
      fileHash: 'audit-hash',
      fileKey: 'documents/company-1/audits/doc.pdf',
      module: 'audit',
    });

    expect(documentRegistryService.findByDocument).toHaveBeenCalledWith(
      'audit',
      'audit-1',
      'pdf',
      'company-1',
    );
  });

  it('expõe internamente tipos documentais sem mapeamento', async () => {
    const loggerWarn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation();

    await expect(
      service.findRegistryContextForSignature(
        'document-1',
        'TIPO_DESCONHECIDO',
        'company-1',
      ),
    ).resolves.toBeNull();

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Tipo documental sem mapeamento'),
    );
  });
});
