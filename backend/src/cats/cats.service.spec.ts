import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditAction } from '../audit/enums/audit-action.enum';
import type { AuditService } from '../audit/audit.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { StorageService } from '../common/services/storage.service';
import type { TenantService } from '../common/tenant/tenant.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { CatsService } from './cats.service';
import type { CreateCatDto } from './dto/create-cat.dto';
import type { UpdateCatDto } from './dto/update-cat.dto';
import { Cat } from './entities/cat.entity';

const COMPANY_ID = 'company-1';
const CAT_ID = '11111111-2222-3333-4444-555555555555';

function makeCat(overrides: Partial<Cat> = {}): Cat {
  return {
    id: CAT_ID,
    numero: 'CAT-20260319-0001',
    company_id: COMPANY_ID,
    site_id: 'site-1',
    data_ocorrencia: new Date('2026-03-19T10:00:00Z'),
    tipo: 'tipico',
    gravidade: 'moderada',
    descricao: 'Queda sem afastamento',
    status: 'aberta',
    attachments: [],
    created_at: new Date('2026-03-19T10:00:00Z'),
    updated_at: new Date('2026-03-19T10:00:00Z'),
    ...overrides,
  } as Cat;
}

describe('CatsService', () => {
  let service: CatsService;
  let catsRepository: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
  };
  let usersRepository: { exist: jest.Mock };
  let sitesRepository: { exist: jest.Mock };
  let tenantService: Pick<TenantService, 'getTenantId'>;
  let storageService: Pick<
    StorageService,
    'uploadFile' | 'deleteFile' | 'getPresignedDownloadUrl'
  >;
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'getSignedUrl' | 'deleteFile'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument'
  >;
  let documentRegistryService: Pick<DocumentRegistryService, 'findByDocument'>;
  let auditService: Pick<AuditService, 'log'>;

  beforeEach(() => {
    catsRepository = {
      create: jest.fn((input: Partial<Cat>) => ({ ...input }) as Cat),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
      findOne: jest.fn(),
      save: jest.fn((input: Cat) => Promise.resolve(input)),
      count: jest.fn().mockResolvedValue(0),
    };
    usersRepository = {
      exist: jest.fn().mockResolvedValue(true),
    };
    sitesRepository = {
      exist: jest.fn().mockResolvedValue(true),
    };
    tenantService = {
      getTenantId: jest.fn(() => COMPANY_ID),
    };
    storageService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getPresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://storage.example.test/file.pdf'),
    };
    documentStorageService = {
      generateDocumentKey: jest
        .fn()
        .mockReturnValue(
          'documents/company-1/cats/sites/site-1/cat-1/cat-final.pdf',
        ),
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://storage.example.test/cat-final.pdf'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn().mockResolvedValue({
        hash: 'hash-cat-pdf',
        registryEntry: {
          id: 'registry-1',
          document_code: 'CAT-2026-11111111',
        },
      }),
    };
    documentRegistryService = {
      findByDocument: jest.fn().mockResolvedValue(null),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new CatsService(
      catsRepository as unknown as Repository<Cat>,
      usersRepository as unknown as Repository<User>,
      sitesRepository as unknown as Repository<Site>,
      tenantService as TenantService,
      storageService as StorageService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
      auditService as AuditService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia create quando o site nao pertence a empresa atual', async () => {
    sitesRepository.exist.mockResolvedValue(false);

    const dto: CreateCatDto = {
      numero: 'CAT-20260319-0007',
      data_ocorrencia: '2026-03-19T10:00:00.000Z',
      descricao: 'Descricao da CAT',
      site_id: 'site-outra-empresa',
    };

    await expect(service.create(dto, 'user-1')).rejects.toThrow(
      new BadRequestException(
        'Obra/setor informado não pertence à empresa atual.',
      ),
    );
    expect(catsRepository.save).not.toHaveBeenCalled();
  });

  it('bloqueia update quando o colaborador nao pertence a empresa atual', async () => {
    catsRepository.findOne.mockResolvedValue(makeCat());
    usersRepository.exist.mockResolvedValue(false);

    const dto: UpdateCatDto = {
      worker_id: 'worker-outra-empresa',
    };

    await expect(service.update(CAT_ID, dto, 'user-1')).rejects.toThrow(
      new BadRequestException(
        'Colaborador informado não pertence à empresa atual.',
      ),
    );
    expect(catsRepository.save).not.toHaveBeenCalled();
  });

  it('limpa o arquivo do storage quando o save do anexo falha', async () => {
    catsRepository.findOne.mockResolvedValue(makeCat());
    catsRepository.save.mockRejectedValueOnce(new Error('db-failure'));

    await expect(
      service.addAttachment(
        CAT_ID,
        {
          fileBuffer: Buffer.from('conteudo-cat'),
          originalName: 'evidencia-cat.pdf',
          mimeType: 'application/pdf',
        },
        'user-1',
      ),
    ).rejects.toThrow('db-failure');

    expect(storageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(storageService.deleteFile).toHaveBeenCalledTimes(1);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('remove o arquivo do storage ao excluir anexo da CAT', async () => {
    const attachment = {
      id: 'attachment-1',
      file_name: 'evidencia-cat.pdf',
      file_key: 'cats/company-1/2026/03/file.pdf',
      file_type: 'application/pdf',
      category: 'geral' as const,
      uploaded_at: new Date('2026-03-19T10:00:00Z'),
      uploaded_by_id: 'user-1',
    };
    catsRepository.findOne.mockResolvedValue(
      makeCat({
        attachments: [attachment],
      }),
    );

    await service.removeAttachment(CAT_ID, attachment.id, 'user-1');

    expect(catsRepository.save).toHaveBeenCalledTimes(1);
    expect(storageService.deleteFile).toHaveBeenCalledWith(attachment.file_key);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entity: 'CAT',
        entityId: CAT_ID,
        companyId: COMPANY_ID,
      }),
    );
  });

  it('gera acesso ao anexo e registra auditoria de leitura', async () => {
    const attachment = {
      id: 'attachment-1',
      file_name: 'evidencia-cat.pdf',
      file_key: 'cats/company-1/2026/03/file.pdf',
      file_type: 'application/pdf',
      category: 'investigacao' as const,
      uploaded_at: new Date('2026-03-19T10:00:00Z'),
      uploaded_by_id: 'user-1',
    };
    catsRepository.findOne.mockResolvedValue(
      makeCat({
        attachments: [attachment],
      }),
    );

    const result = await service.getAttachmentAccess(
      CAT_ID,
      attachment.id,
      'viewer-1',
    );

    expect(result).toEqual({
      attachmentId: attachment.id,
      fileName: attachment.file_name,
      fileType: attachment.file_type,
      url: 'https://storage.example.test/file.pdf',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.READ,
        entity: 'CAT',
        entityId: CAT_ID,
        companyId: COMPANY_ID,
      }),
    );
  });

  it('falha quando o anexo solicitado nao existe', async () => {
    catsRepository.findOne.mockResolvedValue(makeCat());

    await expect(
      service.getAttachmentAccess(CAT_ID, 'attachment-inexistente', 'viewer-1'),
    ).rejects.toThrow(
      new NotFoundException('Anexo não encontrado para esta CAT.'),
    );
  });

  it('retorna contrato explicito quando a CAT ainda nao possui PDF final governado', async () => {
    catsRepository.findOne.mockResolvedValue(
      makeCat({
        pdf_file_key: undefined,
      }),
    );

    await expect(service.getPdfAccess(CAT_ID)).resolves.toEqual({
      catId: CAT_ID,
      hasFinalPdf: false,
      availability: 'not_emitted',
      message:
        'A CAT ainda não possui PDF final emitido. Gere o documento final governado para habilitar download e envio oficial.',
      degraded: false,
      fileKey: null,
      folderPath: null,
      originalName: null,
      fileHash: null,
      documentCode: 'CAT-2026-11111111',
      url: null,
    });
  });

  it('anexa PDF final governado quando a CAT esta fechada', async () => {
    catsRepository.findOne.mockResolvedValue(
      makeCat({
        status: 'fechada',
      }),
    );

    const file = {
      originalname: 'cat-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    } as Express.Multer.File;

    const result = await service.attachPdf(CAT_ID, file, 'user-1');

    expect(documentStorageService.generateDocumentKey).toHaveBeenCalledWith(
      COMPANY_ID,
      'cats',
      CAT_ID,
      'cat-final.pdf',
      { folderSegments: ['sites', 'site-1'] },
    );
    expect(documentGovernanceService.registerFinalDocument).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        catId: CAT_ID,
        hasFinalPdf: true,
        availability: 'ready',
        fileHash: 'hash-cat-pdf',
      }),
    );
  });

  it('bloqueia emissao de PDF final para CAT que ainda nao foi fechada', async () => {
    catsRepository.findOne.mockResolvedValue(
      makeCat({
        status: 'investigacao',
      }),
    );

    const file = {
      originalname: 'cat-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    } as Express.Multer.File;

    await expect(service.attachPdf(CAT_ID, file, 'user-1')).rejects.toThrow(
      new BadRequestException(
        'A CAT precisa estar fechada antes da emissão do PDF final governado.',
      ),
    );
  });
});
