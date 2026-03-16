import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { DdsService } from './dds.service';
import { Dds, DdsStatus } from './entities/dds.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('DdsService', () => {
  let service: DdsService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
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
      findOne: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as Dds)),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/dds/dds-1/dds-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new DdsService(
      repository as unknown as Repository<Dds>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('anexa o PDF final do DDS pela esteira central', async () => {
    const dds = {
      id: 'dds-1',
      company_id: 'company-1',
      tema: 'DDS Trabalho em Altura',
      data: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Dds;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    repository.findOne.mockResolvedValue(dds);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).resolves.toEqual({
      fileKey: 'documents/company-1/dds/dds-1/dds-final.pdf',
      folderPath: 'dds/company-1',
      originalName: 'dds-final.pdf',
    });

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'dds',
        entityId: 'dds-1',
        fileBuffer: file.buffer,
      }),
    );
    const [id, payload] = update.mock.calls[0] as [
      string,
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(id).toBe('dds-1');
    expect(payload.pdf_file_key).toBe(
      'documents/company-1/dds/dds-1/dds-final.pdf',
    );
    expect(payload.pdf_original_name).toBe('dds-final.pdf');
  });

  it('bloqueia atualizacao quando ja existe PDF final anexado', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/dds/dds-1/dds-final.pdf',
    } as Dds);

    await expect(
      service.update('dds-1', { tema: 'Novo tema' }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia transicao de status quando ja existe PDF final anexado', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: 'rascunho',
      pdf_file_key: 'documents/company-1/dds/dds-1/dds-final.pdf',
    } as Dds);

    await expect(
      service.updateStatus('dds-1', DdsStatus.PUBLICADO),
    ).rejects.toThrow(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia novo anexo quando o DDS ja possui PDF final', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/dds/dds-1/dds-final.pdf',
    } as Dds);

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).rejects.toThrow(
      BadRequestException,
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
  });

  it('remove o DDS via esteira central e aplica a policy de lifecycle', async () => {
    const dds = {
      id: 'dds-1',
      company_id: 'company-1',
    } as Dds;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    repository.findOne.mockResolvedValue(dds);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(service.remove('dds-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('dds');
    expect(removeInput.entityId).toBe('dds-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('dds-1');
  });

  it('remove o arquivo do DDS do storage quando a governanca falha depois do upload', async () => {
    const dds = {
      id: 'dds-1',
      company_id: 'company-1',
      tema: 'DDS Trabalho em Altura',
      data: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Dds;
    repository.findOne.mockResolvedValue(dds);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).rejects.toThrow(
      'governance failed',
    );

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/dds/dds-1/dds-final.pdf',
    );
  });
});
