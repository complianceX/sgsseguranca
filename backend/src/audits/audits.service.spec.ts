import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { AuditsService } from './audits.service';
import { Audit } from './entities/audit.entity';
import type { TenantRepositoryFactory } from '../common/tenant/tenant-repository';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('AuditsService', () => {
  let service: AuditsService;
  let repository: {
    save: jest.Mock;
  };
  let tenantRepo: {
    findOne: jest.Mock;
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'deleteFile'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;

  beforeEach(() => {
    repository = {
      save: jest.fn((input) => Promise.resolve(input as Audit)),
    };
    tenantRepo = {
      findOne: jest.fn(),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/audits/audit-1/audit-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new AuditsService(
      repository as unknown as Repository<Audit>,
      {
        wrap: jest.fn(() => tenantRepo),
      } as unknown as TenantRepositoryFactory,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('anexa o PDF final da auditoria pela esteira central', async () => {
    const audit = {
      id: 'audit-1',
      company_id: 'company-1',
      titulo: 'Auditoria de campo',
      data_auditoria: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Audit;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    tenantRepo.findOne.mockResolvedValue(audit);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const file = {
      originalname: 'audit-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-audit'),
    } as Express.Multer.File;

    await expect(
      service.attachPdf('audit-1', 'company-1', file, 'user-1'),
    ).resolves.toEqual({
      fileKey: 'documents/company-1/audits/audit-1/audit-final.pdf',
      folderPath: 'audits/company-1',
      originalName: 'audit-final.pdf',
    });

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'audit',
        entityId: 'audit-1',
        fileBuffer: file.buffer,
        createdBy: 'user-1',
      }),
    );
    const [id, payload] = update.mock.calls[0] as [
      string,
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(id).toBe('audit-1');
    expect(payload.pdf_file_key).toBe(
      'documents/company-1/audits/audit-1/audit-final.pdf',
    );
    expect(payload.pdf_original_name).toBe('audit-final.pdf');
  });

  it('bloqueia atualizacao quando ja existe PDF final anexado', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: 'audit-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/audits/audit-1/audit-final.pdf',
    } as Audit);

    await expect(
      service.update('audit-1', { titulo: 'Novo titulo' }, 'company-1'),
    ).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia novo anexo quando a auditoria ja possui PDF final', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: 'audit-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/audits/audit-1/audit-final.pdf',
    } as Audit);

    const file = {
      originalname: 'audit-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-audit'),
    } as Express.Multer.File;

    await expect(
      service.attachPdf('audit-1', 'company-1', file, 'user-1'),
    ).rejects.toThrow(BadRequestException);

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
  });

  it('remove a auditoria via esteira central e aplica a policy de lifecycle', async () => {
    const audit = {
      id: 'audit-1',
      company_id: 'company-1',
    } as Audit;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    tenantRepo.findOne.mockResolvedValue(audit);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(
      service.remove('audit-1', 'company-1'),
    ).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('audit');
    expect(removeInput.entityId).toBe('audit-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('audit-1');
  });

  it('remove o arquivo da auditoria do storage quando a governanca falha depois do upload', async () => {
    const audit = {
      id: 'audit-1',
      company_id: 'company-1',
      titulo: 'Auditoria de campo',
      data_auditoria: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Audit;
    tenantRepo.findOne.mockResolvedValue(audit);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    const file = {
      originalname: 'audit-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-audit'),
    } as Express.Multer.File;

    await expect(
      service.attachPdf('audit-1', 'company-1', file, 'user-1'),
    ).rejects.toThrow('governance failed');

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/audits/audit-1/audit-final.pdf',
    );
  });
});
