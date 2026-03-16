import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InspectionsService } from './inspections.service';
import { Inspection } from './entities/inspection.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { NotificationsGateway } from '../notifications/notifications.gateway';
import type { TenantRepositoryFactory } from '../common/tenant/tenant-repository';
import type { S3Service } from '../common/storage/s3.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';

describe('InspectionsService', () => {
  let service: InspectionsService;
  let inspectionsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
    update: jest.Mock;
  };
  let tenantRepo: { findOne: jest.Mock };
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'deleteFile' | 'getSignedUrl'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    | 'registerFinalDocument'
    | 'removeFinalDocumentReference'
    | 'listFinalDocuments'
    | 'getModuleWeeklyBundle'
  >;
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'findByCode' | 'findByDocument'
  >;

  beforeEach(() => {
    inspectionsRepository = {
      create: jest.fn(),
      save: jest.fn((input: Inspection) => Promise.resolve(input)),
      findOne: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
    };
    tenantRepo = {
      findOne: jest.fn(),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () =>
          'documents/company-1/inspections/11111111-1111-4111-8111-111111111111/inspection-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://example.com/final.pdf'),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(() =>
        Promise.resolve({
          hash: 'hash-1',
          registryEntry: { id: 'registry-1' },
        }),
      ),
      removeFinalDocumentReference: jest.fn(() => Promise.resolve()),
      listFinalDocuments: jest.fn(() => Promise.resolve([])),
      getModuleWeeklyBundle: jest.fn(),
    };
    documentRegistryService = {
      findByCode: jest.fn(),
      findByDocument: jest.fn(),
    };

    service = new InspectionsService(
      inspectionsRepository as unknown as Repository<Inspection>,
      {} as Repository<never>,
      {} as Repository<never>,
      { sendToCompany: jest.fn() } as unknown as NotificationsGateway,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {
        wrap: jest.fn(() => tenantRepo),
      } as unknown as TenantRepositoryFactory,
      {} as S3Service,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registra o PDF final da inspeção no registry com código INS explícito', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      company_id: 'company-1',
      setor_area: 'Subestação Principal',
      tipo_inspecao: 'Rotina',
      data_inspecao: new Date('2026-03-15T00:00:00.000Z'),
      created_at: new Date('2026-03-15T10:00:00.000Z'),
    } as Inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    const file = {
      originalname: 'inspection-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-inspection'),
    } as Express.Multer.File;

    await expect(
      service.savePdf(
        '11111111-1111-4111-8111-111111111111',
        file,
        'company-1',
      ),
    ).resolves.toEqual({
      fileKey:
        'documents/company-1/inspections/11111111-1111-4111-8111-111111111111/inspection-final.pdf',
      folderPath: 'inspections/company-1/2026/week-11',
      originalName: 'inspection-final.pdf',
    });

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'inspection',
        entityId: '11111111-1111-4111-8111-111111111111',
        documentCode: 'INS-2026-11111111',
        originalName: 'inspection-final.pdf',
        fileBuffer: file.buffer,
      }),
    );
  });

  it('bloqueia edição quando a inspeção já possui PDF final emitido', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: 'inspection-1',
      company_id: 'company-1',
    } as Inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-1',
    });

    await expect(
      service.update('inspection-1', { setor_area: 'Novo setor' }, 'company-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(inspectionsRepository.save).not.toHaveBeenCalled();
  });

  it('valida código público de inspeção somente quando o documento final existe no registry', async () => {
    (documentRegistryService.findByCode as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'registry-1',
        module: 'inspection',
        entity_id: 'inspection-1',
      });
    inspectionsRepository.findOne.mockResolvedValue({
      id: 'inspection-1',
      site_id: 'site-1',
      setor_area: 'Subestação',
      tipo_inspecao: 'Rotina',
      data_inspecao: new Date('2026-03-15T00:00:00.000Z'),
      responsavel_id: 'user-1',
      updated_at: new Date('2026-03-16T00:00:00.000Z'),
    } as Inspection);

    await expect(service.validateByCode('INS-2026-11111111')).resolves.toEqual(
      expect.objectContaining({
        valid: false,
        message:
          'Relatório de inspeção não encontrado ou ainda não foi emitido como documento final.',
      }),
    );

    const successResult = await service.validateByCode('INS-2026-11111111');
    expect(successResult).toMatchObject({
      valid: true,
      code: 'INS-2026-11111111',
      inspection: {
        id: 'inspection-1',
        setor_area: 'Subestação',
        tipo_inspecao: 'Rotina',
      },
    });
  });
});
