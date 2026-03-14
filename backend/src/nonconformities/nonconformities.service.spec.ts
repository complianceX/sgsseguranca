import { Repository } from 'typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformity } from './entities/nonconformity.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { StorageService } from '../common/services/storage.service';
import type { DocumentBundleService } from '../common/services/document-bundle.service';
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
  };
  let storageService: Pick<StorageService, 'uploadFile'>;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as NonConformity)),
      update: jest.fn(),
    };
    storageService = {
      uploadFile: jest.fn(),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new NonConformitiesService(
      repository as unknown as Repository<NonConformity>,
      {} as Repository<Site>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      storageService as StorageService,
      {} as DocumentBundleService,
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

    expect(storageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('nonconformities/company-1/'),
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
    const remove = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ remove })),
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
    expect(remove).toHaveBeenCalledWith(nc);
  });
});
