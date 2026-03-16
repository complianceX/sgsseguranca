import { Repository } from 'typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformity } from './entities/nonconformity.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { AuditService } from '../audit/audit.service';
import type { Site } from '../sites/entities/site.entity';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('NonConformitiesService', () => {
  let service: NonConformitiesService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    'uploadFile' | 'deleteFile' | 'getSignedUrl' | 'generateDocumentKey'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    | 'registerFinalDocument'
    | 'removeFinalDocumentReference'
    | 'listFinalDocuments'
  >;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as NonConformity)),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    documentStorageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(() => Promise.resolve()),
      generateDocumentKey: jest.fn(
        (
          companyId: string,
          documentType: string,
          documentId: string,
          originalName: string,
        ) =>
          `documents/${companyId}/${documentType}/${documentId}/${originalName}`,
      ),
      getSignedUrl: jest.fn(() => Promise.resolve('https://example.com/nc.pdf')),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
      listFinalDocuments: jest.fn(),
    };

    service = new NonConformitiesService(
      repository as unknown as Repository<NonConformity>,
      {} as Repository<Site>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      { log: jest.fn() } as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passa o documento final da NC pelo caminho central de governança', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
      codigo_nc: 'NC-001',
      tipo: 'Operacional',
      data_identificacao: new Date('2026-03-10T00:00:00.000Z'),
    } as NonConformity;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    repository.findOne.mockResolvedValue(nc);
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const buffer = Buffer.from('pdf-content');
    await service.attachPdf('nc-1', buffer, 'nc-001.pdf', 'application/pdf');

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('nc-1.pdf'),
      buffer,
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'nonconformity',
        entityId: 'nc-1',
        originalName: 'nc-001.pdf',
        mimeType: 'application/pdf',
        documentDate: nc.data_identificacao,
        fileBuffer: buffer,
      }),
    );
    const [updateCriteria, updatePayload] = update.mock.calls[0] as [
      { id: string },
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(updateCriteria).toEqual({ id: 'nc-1' });
    expect(updatePayload.pdf_file_key).toContain('/nc-1.pdf');
    expect(updatePayload.pdf_original_name).toBe('nc-001.pdf');
  });

  it('remove a NC via esteira central para limpar o registry corretamente', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
    } as NonConformity;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(service.remove('nc-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('nonconformity');
    expect(removeInput.entityId).toBe('nc-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('nc-1');
  });

  it('remove o arquivo da NC do storage quando a governanca falha', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
      codigo_nc: 'NC-001',
      tipo: 'Operacional',
      data_identificacao: new Date('2026-03-10T00:00:00.000Z'),
    } as NonConformity;
    repository.findOne.mockResolvedValue(nc);
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    await expect(
      service.attachPdf(
        'nc-1',
        Buffer.from('pdf-content'),
        'nc-001.pdf',
        'application/pdf',
      ),
    ).rejects.toThrow('governance failed');

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      expect.stringContaining('nc-1.pdf'),
    );
  });

  it('bloqueia edicao quando a NC já possui PDF final emitido', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      pdf_file_key: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
    } as NonConformity);

    await expect(
      service.update('nc-1', { descricao: 'Novo texto' }),
    ).rejects.toThrow(
      'Não conformidade com PDF final anexado. Edição bloqueada. Gere uma nova NC para alterar o documento.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('filtra arquivos semanais pela data documental da NC', async () => {
    (
      documentGovernanceService.listFinalDocuments as jest.Mock
    ).mockResolvedValue([
      {
        entityId: 'nc-1',
        id: 'nc-1',
        title: 'NC-001',
        date: new Date('2025-12-31T00:00:00.000Z'),
        companyId: 'company-1',
        fileKey: 'nonconformities/company-1/2025/week-01/nc-1.pdf',
        folderPath: 'nonconformities/company-1/2025/week-01',
        originalName: 'nc-1.pdf',
        module: 'nonconformity',
      },
    ]);

    const files = await service.listStoredFiles({ year: 2025 });

    expect(files).toHaveLength(1);
    expect(files[0].entityId).toBe('nc-1');
    expect(documentGovernanceService.listFinalDocuments).toHaveBeenCalledWith(
      'nonconformity',
      { year: 2025 },
    );
  });

  it('retorna metadados do PDF mesmo quando a URL assinada falha', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      pdf_file_key: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
      pdf_folder_path: 'nonconformities/company-1/2026/week-11',
      pdf_original_name: 'nc-1.pdf',
    } as NonConformity);
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValueOnce(
      new Error('storage offline'),
    );

    await expect(service.getPdfAccess('nc-1')).resolves.toEqual({
      entityId: 'nc-1',
      fileKey: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
      folderPath: 'nonconformities/company-1/2026/week-11',
      originalName: 'nc-1.pdf',
      url: null,
    });
  });
});
