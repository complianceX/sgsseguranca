import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { DidsService } from './dids.service';
import { Did, DidStatus } from './entities/did.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];

describe('DidsService', () => {
  let service: DidsService;
  let didRepository: jest.Mocked<Repository<Did>>;
  let tenantService: Partial<TenantService>;
  let documentStorageService: Partial<DocumentStorageService>;
  let documentGovernanceService: Partial<DocumentGovernanceService>;

  beforeEach(() => {
    didRepository = {
      findOne: jest.fn(),
      save: jest.fn((input: Did) => Promise.resolve(input)),
      create: jest.fn((input: Partial<Did>) => input),
    } as unknown as jest.Mocked<Repository<Did>>;

    tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    };

    documentStorageService = {
      generateDocumentKey: jest.fn(
        (companyId: string, module: string, entityId: string) =>
          `documents/${companyId}/${module}/${entityId}/did-final.pdf`,
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://signed.example/pdf'),
      ),
    };

    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new DidsService(
      didRepository as unknown as Repository<Did>,
      tenantService as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  it('rejeita company_id forjado no payload ao criar DID', async () => {
    await expect(
      service.create({
        titulo: 'DID operação de içamento',
        data: '2026-04-15',
        atividade_principal: 'Içamento de componentes',
        atividades_planejadas: 'Movimentação controlada com sinalização e spotter.',
        riscos_operacionais: 'Esmagamento, colisão e queda de carga suspensa.',
        controles_planejados: 'Isolamento da área, sinaleiro e checklist pré-uso.',
        site_id: '11111111-1111-4111-8111-111111111111',
        responsavel_id: '22222222-2222-4222-8222-222222222222',
        participants: ['33333333-3333-4333-8333-333333333333'],
        company_id: 'tenant-forjado',
      } as never),
    ).rejects.toThrow(BadRequestException);

    expect(didRepository.create).not.toHaveBeenCalled();
  });

  it('emite 20 PDFs finais de DID simultaneamente sem degradar o fluxo governado', async () => {
    const dids = Array.from({ length: 20 }, (_, index) => {
      const didId = `did-${index + 1}`;
      return {
        id: didId,
        titulo: `DID ${index + 1}`,
        company_id: 'company-1',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        status: DidStatus.ALINHADO,
        data: new Date('2026-04-15'),
        created_at: new Date('2026-04-15T07:00:00.000Z'),
        participants: [{ id: `participant-${index + 1}` }],
        pdf_file_key: null,
        pdf_folder_path: null,
        pdf_original_name: null,
      } as unknown as Did;
    });

    const didMap = new Map(dids.map((did) => [did.id, did]));
    didRepository.findOne.mockImplementation(({ where }) => {
      const candidateId =
        typeof where === 'object' &&
        where !== null &&
        'id' in where &&
        typeof where.id === 'string'
          ? where.id
          : '';
      return Promise.resolve(didMap.get(candidateId) || null);
    });

    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      const update = jest.fn().mockResolvedValue({ affected: 1 });
      const manager = {
        getRepository: jest.fn(() => ({ update })),
      } as unknown as EntityManager;
      await input.persistEntityMetadata?.(manager, `hash-${input.entityId}`);
      return {
        hash: `hash-${input.entityId}`,
        registryEntry: { id: `registry-${input.entityId}` },
      };
    });

    const files = dids.map((did) => ({
      originalname: `${did.id}.pdf`,
      mimetype: 'application/pdf',
      buffer: Buffer.from(`%PDF-${did.id}`),
    })) as Express.Multer.File[];

    const results = await Promise.all(
      dids.map((did, index) =>
        service.attachPdf(did.id, files[index], {
          userId: `emitter-${index + 1}`,
        }),
      ),
    );

    expect(results).toHaveLength(20);
    expect(results.every((result) => result.degraded === false)).toBe(true);
    expect(documentStorageService.uploadFile).toHaveBeenCalledTimes(20);
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledTimes(20);
    expect(documentStorageService.generateDocumentKey).toHaveBeenCalledTimes(
      20,
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        module: 'did',
        entityId: 'did-1',
        createdBy: 'emitter-1',
      }),
    );
  });

  it('bloqueia emissao final quando o DID ainda esta em rascunho', async () => {
    didRepository.findOne.mockResolvedValue({
      id: 'did-rascunho',
      titulo: 'DID rascunho',
      company_id: 'company-1',
      site_id: 'site-1',
      responsavel_id: 'user-1',
      status: DidStatus.RASCUNHO,
      data: new Date('2026-04-15'),
      created_at: new Date('2026-04-15T07:00:00.000Z'),
      participants: [{ id: 'participant-1' }],
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
    } as unknown as Did);

    const file = {
      originalname: 'did-rascunho.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-did-rascunho'),
    } as Express.Multer.File;

    await expect(service.attachPdf('did-rascunho', file)).rejects.toThrow(
      BadRequestException,
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
  });
});
