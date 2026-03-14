import { DataSource, Repository } from 'typeorm';
import { ChecklistsService } from './checklists.service';
import { Checklist } from './entities/checklist.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';
import type { SignaturesService } from '../signatures/signatures.service';
import type { StorageService } from '../common/services/storage.service';
import type { UsersService } from '../users/users.service';
import type { SitesService } from '../sites/sites.service';
import type { NotificationsGateway } from '../notifications/notifications.gateway';
import type { DocumentBundleService } from '../common/services/document-bundle.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('ChecklistsService', () => {
  let service: ChecklistsService;
  let repository: {
    update: jest.Mock;
  };
  let storageService: Pick<
    StorageService,
    'uploadFile' | 'getPresignedDownloadUrl'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;

  beforeEach(() => {
    repository = {
      update: jest.fn(),
    };
    storageService = {
      uploadFile: jest.fn(),
      getPresignedDownloadUrl: jest.fn(() =>
        Promise.resolve('https://example.com/checklist.pdf'),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new ChecklistsService(
      repository as unknown as Repository<Checklist>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as DataSource,
      {} as MailService,
      {} as SignaturesService,
      {} as NotificationsGateway,
      storageService as StorageService,
      {} as UsersService,
      {} as SitesService,
      {} as DocumentBundleService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passa o checklist final pela esteira central e persiste metadados no callback transacional', async () => {
    const checklist = {
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist de campo',
      data: new Date('2026-03-14T12:00:00.000Z'),
    } as Checklist;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    jest.spyOn(service, 'findOneEntity').mockResolvedValue(checklist);
    jest
      .spyOn(service, 'generatePdf')
      .mockResolvedValue(Buffer.from('%PDF-checklist'));
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const result = await service.savePdfToStorage('checklist-1');

    expect(result.fileKey).toEqual(
      expect.stringContaining('checklist-checklist-1.pdf'),
    );
    expect(result.folderPath).toEqual(
      expect.stringContaining('documents/company-1/checklists/'),
    );
    expect(result.fileUrl).toBe('https://example.com/checklist.pdf');

    expect(storageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('checklist-checklist-1.pdf'),
      Buffer.from('%PDF-checklist'),
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        fileBuffer: Buffer.from('%PDF-checklist'),
      }),
    );
    const [updateCriteria, updatePayload] = update.mock.calls[0] as [
      { id: string },
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(updateCriteria).toEqual({ id: 'checklist-1' });
    expect(updatePayload.pdf_file_key).toContain('checklist-checklist-1.pdf');
    expect(updatePayload.pdf_original_name).toBe('checklist-checklist-1.pdf');
  });

  it('remove checklist via esteira central para limpar o registry no mesmo fluxo', async () => {
    const checklist = {
      id: 'checklist-1',
      company_id: 'company-1',
    } as Checklist;
    const remove = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ remove })),
    };
    jest.spyOn(service, 'findOneEntity').mockResolvedValue(checklist);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(service.remove('checklist-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('checklist');
    expect(removeInput.entityId).toBe('checklist-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(remove).toHaveBeenCalledWith(checklist);
  });
});
