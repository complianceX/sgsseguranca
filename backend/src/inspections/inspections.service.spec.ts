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
import type { DocumentVideosService } from '../document-videos/document-videos.service';

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
  let documentVideosService: Pick<
    DocumentVideosService,
    'listByDocument' | 'uploadForDocument' | 'getAccess' | 'removeFromDocument'
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
    documentVideosService = {
      listByDocument: jest.fn(() => Promise.resolve([])),
      uploadForDocument: jest.fn(),
      getAccess: jest.fn(),
      removeFromDocument: jest.fn(),
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
      documentVideosService as DocumentVideosService,
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

  it('lanca NotFoundException quando inspeção não existe', async () => {
    tenantRepo.findOne.mockResolvedValue(null);
    await expect(
      service.findOneEntity('inexistente', 'company-1'),
    ).rejects.toThrow('Inspeção com ID inexistente não encontrada');
  });

  it('remove inspeção chamando removeFinalDocumentReference e hard-delete', async () => {
    const inspection = {
      id: 'insp-1',
      company_id: 'company-1',
      setor_area: 'Almoxarifado',
      tipo_inspecao: 'Rotina',
    } as Inspection;
    tenantRepo.findOne.mockResolvedValue(inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );
    const deleteInEntity = jest.fn().mockResolvedValue(undefined);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementationOnce(
      async (input: { removeEntityState: (m: unknown) => Promise<void> }) => {
        await input.removeEntityState({
          getRepository: jest.fn(() => ({ delete: deleteInEntity })),
        });
      },
    );

    await expect(
      service.remove('insp-1', 'company-1'),
    ).resolves.toBeUndefined();
    expect(
      documentGovernanceService.removeFinalDocumentReference,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'inspection', entityId: 'insp-1' }),
    );
    expect(deleteInEntity).toHaveBeenCalledWith({ id: 'insp-1' });
  });

  it('attachEvidence: adiciona evidência à lista existente', async () => {
    const inspection = {
      id: 'insp-1',
      company_id: 'company-1',
      evidencias: [{ descricao: 'Foto 1', url: 'data:image/jpeg;base64,aaa' }],
    } as unknown as Inspection;
    tenantRepo.findOne.mockResolvedValue(inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    const s3Service = (
      service as unknown as {
        s3Service: { generateDocumentKey: jest.Mock; uploadFile: jest.Mock };
      }
    ).s3Service;
    s3Service.generateDocumentKey = jest.fn(
      () => 'inspections/company-1/insp-1/foto.jpg',
    );
    s3Service.uploadFile = jest.fn().mockResolvedValue(undefined);

    const file = {
      originalname: 'foto.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake-image'),
    } as Express.Multer.File;

    const result = await service.attachEvidence(
      'insp-1',
      file,
      'Nova foto',
      'company-1',
    );
    expect(result.storageMode).toBe('s3');
    expect(result.degraded).toBe(false);
    expect(result.message).toBeNull();
    expect(result.evidencias).toHaveLength(2);
    expect(result.evidencias[1]).toMatchObject({
      descricao: 'Nova foto',
      original_name: 'foto.jpg',
    });
    expect(inspectionsRepository.update).toHaveBeenCalledWith(
      'insp-1',
      expect.any(Object),
    );
    const updateCalls = inspectionsRepository.update.mock.calls as Array<
      [string, { evidencias?: Array<{ descricao?: string }> }]
    >;
    const updatePayload = updateCalls[0]?.[1];
    expect(
      updatePayload.evidencias?.some(
        (evidencia) => evidencia.descricao === 'Nova foto',
      ),
    ).toBe(true);
  });

  it('attachEvidence: sinaliza modo degradado quando cai no fallback inline', async () => {
    const inspection = {
      id: 'insp-1',
      company_id: 'company-1',
      evidencias: [],
    } as unknown as Inspection;
    tenantRepo.findOne.mockResolvedValue(inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    const s3Service = (
      service as unknown as {
        s3Service: { generateDocumentKey: jest.Mock; uploadFile: jest.Mock };
      }
    ).s3Service;
    s3Service.generateDocumentKey = jest.fn(
      () => 'inspections/company-1/insp-1/foto.jpg',
    );
    s3Service.uploadFile = jest
      .fn()
      .mockRejectedValue(new Error('storage offline'));

    const file = {
      originalname: 'foto.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from('fake-image'),
      size: Buffer.byteLength('fake-image'),
    } as Express.Multer.File;

    const result = await service.attachEvidence(
      'insp-1',
      file,
      'Foto degradada',
      'company-1',
    );

    expect(result.storageMode).toBe('inline-fallback');
    expect(result.degraded).toBe(true);
    expect(result.message).toContain('modo degradado inline');
    expect(result.evidencias[0]?.url).toContain('data:image/jpeg;base64,');
  });

  it('savePdf: faz cleanup do arquivo quando governança falha', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      company_id: 'company-1',
      setor_area: 'Área Teste',
      tipo_inspecao: 'Especial',
      data_inspecao: new Date('2026-03-15T00:00:00.000Z'),
      created_at: new Date(),
    } as Inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failure'));

    const file = {
      originalname: 'insp.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-inspection'),
    } as Express.Multer.File;

    await expect(
      service.savePdf(
        '11111111-1111-4111-8111-111111111111',
        file,
        'company-1',
      ),
    ).rejects.toThrow('governance failure');

    expect(documentStorageService.deleteFile).toHaveBeenCalled();
  });

  it('countPendingActionItems: lança BadRequestException sem tenant', async () => {
    const serviceWithNoTenant = new (InspectionsService as unknown as new (
      ...args: unknown[]
    ) => InspectionsService)(
      inspectionsRepository,
      {},
      {},
      { sendToCompany: jest.fn() },
      { getTenantId: jest.fn(() => null) },
      { wrap: jest.fn(() => tenantRepo) },
      {},
      documentStorageService,
      documentGovernanceService,
      documentRegistryService,
    );

    await expect(
      serviceWithNoTenant.countPendingActionItems(undefined),
    ).rejects.toThrow('Contexto de empresa obrigatório');
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

  it('bloqueia atualização com evidência inline acima do limite operacional', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: 'inspection-1',
      company_id: 'company-1',
      evidencias: [],
    } as Inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    const oversizedInlineEvidence = `data:image/jpeg;base64,${Buffer.alloc(
      1024 * 1024 + 1,
      1,
    ).toString('base64')}`;

    await expect(
      service.update(
        'inspection-1',
        {
          evidencias: [
            {
              descricao: 'Foto offline',
              url: oversizedInlineEvidence,
            },
          ],
        },
        'company-1',
      ),
    ).rejects.toThrow(
      'Evidência inline excede o limite de 1.00MB para criação ou edição.',
    );

    expect(inspectionsRepository.save).not.toHaveBeenCalled();
  });

  it('retorna status explícito quando o PDF final ainda não foi emitido', async () => {
    tenantRepo.findOne.mockResolvedValue({
      id: 'inspection-1',
      company_id: 'company-1',
    } as Inspection);
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    await expect(
      service.getPdfAccess('inspection-1', 'company-1'),
    ).resolves.toEqual({
      entityId: 'inspection-1',
      hasFinalPdf: false,
      availability: 'not_emitted',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
      message:
        'Relatório de inspeção ainda não possui PDF final emitido e governado.',
    });
  });
});
