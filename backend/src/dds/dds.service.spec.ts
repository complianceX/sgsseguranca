import { Repository } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { DdsService } from './dds.service';
import { Dds, DdsStatus } from './entities/dds.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentVideosService } from '../document-videos/document-videos.service';
import type { SignaturesService } from '../signatures/signatures.service';
import { Signature } from '../signatures/entities/signature.entity';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('DdsService', () => {
  type SiteFindOneArgs = { where?: { id?: string } };
  type UserFindArgs = {
    where?: {
      id?: {
        value?: string[];
        _value?: string[];
      };
    };
  };
  type MockManager = {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };

  let service: DdsService;
  let repository: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: {
      getRepository: jest.Mock;
      transaction: jest.Mock;
    };
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'deleteFile' | 'getSignedUrl'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;
  let documentVideosService: Pick<
    DocumentVideosService,
    'listByDocument' | 'uploadForDocument' | 'getAccess' | 'removeFromDocument'
  >;
  let signaturesService: Pick<
    SignaturesService,
    'findByDocument' | 'replaceDocumentSignatures' | 'findManyByDocuments'
  >;
  let signatureRepository: { delete: jest.Mock };
  let siteRepository: { findOne: jest.Mock };
  let userRepository: { find: jest.Mock };
  let transactionalDdsRepository: {
    save: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(() => {
    signatureRepository = {
      delete: jest.fn(() => Promise.resolve()),
    };
    siteRepository = {
      findOne: jest.fn((options: SiteFindOneArgs) =>
        Promise.resolve(
          options.where?.id ? ({ id: options.where.id } as Site) : null,
        ),
      ),
    };
    userRepository = {
      find: jest.fn((options: UserFindArgs) => {
        const ids = Array.isArray(options.where?.id?.value)
          ? options.where.id.value
          : Array.isArray(options.where?.id?._value)
            ? options.where.id._value
            : [];
        return Promise.resolve(ids.map((id) => ({ id }) as User));
      }),
    };
    transactionalDdsRepository = {
      save: jest.fn((input) => Promise.resolve(input as Dds)),
      update: jest.fn(),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const manager = {} as MockManager;
    manager.getRepository = jest.fn((entity: unknown) => {
      if (entity === Signature) {
        return signatureRepository;
      }
      if (entity === Site) {
        return siteRepository;
      }
      if (entity === User) {
        return userRepository;
      }
      if (entity === Dds) {
        return transactionalDdsRepository;
      }
      return {};
    });
    manager.transaction = jest.fn(
      (callback: (transactionManager: MockManager) => unknown) =>
        callback(manager),
    );
    repository = {
      findOne: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as Dds)),
      create: jest.fn((input) => input as Dds),
      createQueryBuilder: jest.fn(() => {
        const builder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
        };
        return builder;
      }),
      manager,
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/dds/dds-1/dds-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://example.com/dds.pdf'),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };
    documentVideosService = {
      listByDocument: jest.fn(() => Promise.resolve([])),
      uploadForDocument: jest.fn(),
      getAccess: jest.fn(),
      removeFromDocument: jest.fn(),
    };
    signaturesService = {
      findByDocument: jest.fn(() => Promise.resolve([])),
      replaceDocumentSignatures: jest.fn(),
      findManyByDocuments: jest.fn(() => Promise.resolve([])),
    };

    service = new DdsService(
      repository as unknown as Repository<Dds>,
      { getTenantId: jest.fn(() => 'company-1') } as unknown as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentVideosService as DocumentVideosService,
      signaturesService as SignaturesService,
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
      status: DdsStatus.PUBLICADO,
      participants: [{ id: 'user-1' }],
      data: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Dds;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    repository.findOne.mockResolvedValue(dds);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      {
        user_id: 'user-1',
        type: 'digital',
        signature_data: 'sig-1',
      },
    ]);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata?.(manager as never, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).resolves.toEqual(
      expect.objectContaining({
        fileKey: 'documents/company-1/dds/dds-1/dds-final.pdf',
        folderPath: 'dds/company-1',
        originalName: 'dds-final.pdf',
        storageMode: 's3',
        degraded: false,
      }),
    );

    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'dds',
        entityId: 'dds-1',
        documentCode: 'DDS-2026-DDS1',
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

  it('getPdfAccess: retorna contrato explicito quando o PDF final ainda nao foi emitido', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
    } as unknown as Dds);

    await expect(service.getPdfAccess('dds-1')).resolves.toEqual({
      ddsId: 'dds-1',
      hasFinalPdf: false,
      availability: 'not_emitted',
      message:
        'O DDS ainda não possui PDF final emitido. Gere o documento final para habilitar download governado.',
      degraded: false,
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
    });
  });

  it('getPdfAccess: retorna disponibilidade degradada quando a URL assinada nao pode ser emitida', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/dds/dds-1/dds-final.pdf',
      pdf_folder_path: 'dds/company-1',
      pdf_original_name: 'dds-final.pdf',
    } as unknown as Dds);
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValueOnce(
      new Error('storage offline'),
    );

    await expect(service.getPdfAccess('dds-1')).resolves.toEqual({
      ddsId: 'dds-1',
      hasFinalPdf: true,
      availability: 'registered_without_signed_url',
      message:
        'PDF final registrado, mas a URL segura não está disponível no momento. O storage está em modo degradado.',
      degraded: true,
      fileKey: 'documents/company-1/dds/dds-1/dds-final.pdf',
      folderPath: 'dds/company-1',
      originalName: 'dds-final.pdf',
      url: null,
    });
  });

  it('falha o anexo final quando o storage governado do DDS está indisponível', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      tema: 'DDS Trabalho em Altura',
      status: DdsStatus.PUBLICADO,
      participants: [{ id: 'user-1' }],
      data: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Dds);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      {
        user_id: 'user-1',
        type: 'digital',
        signature_data: 'sig-1',
      },
    ]);
    (documentStorageService.uploadFile as jest.Mock).mockRejectedValue(
      new Error('S3 is not enabled'),
    );

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).rejects.toThrow(
      'S3 is not enabled',
    );

    expect(
      documentGovernanceService.registerFinalDocument,
    ).not.toHaveBeenCalled();
    expect(documentStorageService.deleteFile).not.toHaveBeenCalled();
  });

  it('rejeita criacao quando o site nao pertence a empresa do DDS', async () => {
    siteRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.create({
        tema: 'DDS Integridade',
        data: '2026-03-14',
        company_id: 'company-1',
        site_id: 'site-x',
        facilitador_id: 'user-1',
        participants: ['user-1'],
      }),
    ).rejects.toThrow('O site informado não pertence à empresa atual do DDS.');

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
      await input.removeEntityState?.(manager as never);
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
      status: DdsStatus.PUBLICADO,
      participants: [{ id: 'user-1' }],
      data: new Date('2026-03-14T08:00:00.000Z'),
      created_at: new Date('2026-03-14T07:00:00.000Z'),
    } as Dds;
    repository.findOne.mockResolvedValue(dds);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      {
        user_id: 'user-1',
        type: 'digital',
        signature_data: 'sig-1',
      },
    ]);
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

  it('bloqueia PDF final quando o DDS ainda esta em rascunho', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.RASCUNHO,
      participants: [{ id: 'user-1' }],
      created_at: new Date('2026-03-14T07:00:00.000Z'),
      data: new Date('2026-03-14T08:00:00.000Z'),
    } as unknown as Dds);

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).rejects.toThrow(
      'O DDS precisa estar publicado ou auditado antes do anexo do PDF final.',
    );

    expect(signaturesService.findByDocument).not.toHaveBeenCalled();
    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('bloqueia PDF final quando faltam assinaturas de participantes', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.PUBLICADO,
      participants: [{ id: 'user-1' }, { id: 'user-2' }],
      created_at: new Date('2026-03-14T07:00:00.000Z'),
      data: new Date('2026-03-14T08:00:00.000Z'),
    } as unknown as Dds);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      {
        user_id: 'user-1',
        type: 'digital',
        signature_data: 'sig-1',
      },
    ]);

    const file = {
      originalname: 'dds-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-dds'),
    } as Express.Multer.File;

    await expect(service.attachPdf('dds-1', file)).rejects.toThrow(
      'Todos os participantes precisam assinar o DDS antes do anexo do PDF final.',
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('updateStatus: avanca status de rascunho para publicado', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.RASCUNHO,
      is_modelo: false,
    } as Dds);

    const result = await service.updateStatus('dds-1', DdsStatus.PUBLICADO);
    expect(result.status).toBe(DdsStatus.PUBLICADO);
    expect(repository.save).toHaveBeenCalled();
  });

  it('updateStatus: rejeita transicao invalida', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.AUDITADO,
      is_modelo: false,
    } as Dds);

    await expect(
      service.updateStatus('dds-1', DdsStatus.PUBLICADO),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('updateStatus: bloqueia publicacao de modelo de DDS', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.RASCUNHO,
      is_modelo: true,
    } as Dds);

    await expect(
      service.updateStatus('dds-1', DdsStatus.PUBLICADO),
    ).rejects.toThrow('Modelos de DDS não podem ser publicados ou auditados.');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('updateStatus: bloqueia auditoria de modelo de DDS', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.PUBLICADO,
      is_modelo: true,
    } as Dds);

    await expect(
      service.updateStatus('dds-1', DdsStatus.AUDITADO),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('replaceSignatures: rejeita quando DDS nao tem participantes', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [],
      is_modelo: false,
    } as unknown as Dds);

    await expect(
      service.replaceSignatures(
        'dds-1',
        { participant_signatures: [] },
        'operador-1',
      ),
    ).rejects.toThrow(
      'O DDS precisa ter participantes definidos antes das assinaturas.',
    );
    expect(signaturesService.replaceDocumentSignatures).not.toHaveBeenCalled();
  });

  it('invalida assinaturas existentes quando o conteudo operacional do DDS muda', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      status: DdsStatus.PUBLICADO,
      tema: 'DDS antigo',
      conteudo: 'Conteudo inicial',
      data: new Date('2026-03-14T08:00:00.000Z'),
      site_id: 'site-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: false,
    } as unknown as Dds);

    await expect(
      service.update('dds-1', {
        conteudo: 'Conteudo revisado',
        confirm_signature_reset: true,
      }),
    ).resolves.toMatchObject({
      id: 'dds-1',
      conteudo: 'Conteudo revisado',
    });

    expect(signatureRepository.delete).toHaveBeenCalledWith({
      company_id: 'company-1',
      document_id: 'dds-1',
      document_type: 'DDS',
    });
  });

  it('replaceSignatures: rejeita quando DDS e um modelo', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: true,
    } as unknown as Dds);

    await expect(
      service.replaceSignatures(
        'dds-1',
        {
          participant_signatures: [
            { user_id: 'user-1', signature_data: 'sig', type: 'digital' },
          ],
        },
        'operador-1',
      ),
    ).rejects.toThrow(
      'Modelos de DDS não podem receber assinaturas de execução.',
    );
    expect(signaturesService.replaceDocumentSignatures).not.toHaveBeenCalled();
  });

  it('replaceSignatures: rejeita participante fora do DDS', async () => {
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: false,
    } as unknown as Dds);

    await expect(
      service.replaceSignatures(
        'dds-1',
        {
          participant_signatures: [
            { user_id: 'user-externo', signature_data: 'sig', type: 'digital' },
          ],
        },
        'operador-1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(signaturesService.replaceDocumentSignatures).not.toHaveBeenCalled();
  });

  it('replaceSignatures: rejeita foto duplicada sem justificativa', async () => {
    repository.createQueryBuilder.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'dds-old', tema: 'DDS antigo', data: '2026-03-10' },
        ]),
    }));
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: false,
    } as unknown as Dds);
    (signaturesService.findManyByDocuments as jest.Mock).mockResolvedValue([
      {
        document_id: 'dds-old',
        type: 'team_photo_1',
        signature_data: JSON.stringify({
          imageData: 'data:image/jpeg;base64,old',
          capturedAt: '2026-03-10T08:00:00.000Z',
          hash: 'hash-dup',
          metadata: { userAgent: 'jest' },
        }),
      },
    ]);

    await expect(
      service.replaceSignatures(
        'dds-1',
        {
          participant_signatures: [
            { user_id: 'user-1', signature_data: 'sig', type: 'digital' },
          ],
          team_photos: [
            {
              imageData: 'data:image/jpeg;base64,new',
              capturedAt: '2026-03-14T08:00:00.000Z',
              hash: 'hash-dup',
              metadata: { userAgent: 'jest' },
            },
          ],
          // sem photo_reuse_justification
        },
        'operador-1',
      ),
    ).rejects.toThrow('Detectamos reuso potencial de foto.');
    expect(signaturesService.replaceDocumentSignatures).not.toHaveBeenCalled();
  });

  it('replaceSignatures: aceita assinaturas sem fotos duplicadas normalmente', async () => {
    repository.createQueryBuilder.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }));
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: false,
    } as unknown as Dds);

    const result = await service.replaceSignatures(
      'dds-1',
      {
        participant_signatures: [
          { user_id: 'user-1', signature_data: 'sig-1', type: 'digital' },
        ],
        team_photos: [
          {
            imageData: 'data:image/jpeg;base64,photo',
            capturedAt: '2026-03-14T08:00:00.000Z',
            hash: 'hash-novo',
            metadata: { userAgent: 'jest' },
          },
        ],
      },
      'operador-1',
    );

    expect(result.participantSignatures).toBe(1);
    expect(result.teamPhotos).toBe(1);
    expect(result.duplicatePhotoWarnings).toHaveLength(0);
    expect(signaturesService.replaceDocumentSignatures).toHaveBeenCalledTimes(
      1,
    );
  });

  it('persiste assinaturas do DDS com o participante correto e justificativa de reuso quando necessario', async () => {
    repository.createQueryBuilder.mockImplementationOnce(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'dds-old',
          tema: 'DDS antigo',
          data: '2026-03-10',
        },
      ]),
    }));
    repository.findOne.mockResolvedValue({
      id: 'dds-1',
      company_id: 'company-1',
      facilitador_id: 'facilitador-1',
      participants: [{ id: 'user-1' }],
      is_modelo: false,
    } as unknown as Dds);
    (signaturesService.findManyByDocuments as jest.Mock).mockResolvedValue([
      {
        document_id: 'dds-old',
        type: 'team_photo_1',
        signature_data: JSON.stringify({
          imageData: 'data:image/jpeg;base64,old-photo',
          capturedAt: '2026-03-10T08:00:00.000Z',
          hash: 'hash-duplicado',
          metadata: { userAgent: 'jest' },
        }),
      },
    ]);

    await expect(
      service.replaceSignatures(
        'dds-1',
        {
          participant_signatures: [
            {
              user_id: 'user-1',
              signature_data: '1234',
              type: 'hmac',
              pin: '1234',
            },
          ],
          team_photos: [
            {
              imageData: 'data:image/jpeg;base64,new-photo',
              capturedAt: '2026-03-14T08:00:00.000Z',
              hash: 'hash-duplicado',
              metadata: { userAgent: 'jest' },
            },
          ],
          photo_reuse_justification:
            'Equipe reaproveitou a mesma imagem por indisponibilidade temporaria de camera em campo.',
        },
        'operador-1',
      ),
    ).resolves.toEqual({
      participantSignatures: 1,
      teamPhotos: 1,
      duplicatePhotoWarnings: ['hash-duplicado'],
    });

    const replaceCalls = (
      signaturesService.replaceDocumentSignatures as jest.Mock
    ).mock.calls as Array<
      [
        {
          document_id: string;
          document_type: string;
          authenticated_user_id: string;
          signatures: Array<{
            user_id: string;
            signer_user_id?: string;
            type: string;
            pin?: string;
          }>;
        },
      ]
    >;
    const replaceCall = replaceCalls[0]?.[0] as {
      document_id: string;
      document_type: string;
      authenticated_user_id: string;
      signatures: Array<{
        user_id: string;
        signer_user_id?: string;
        type: string;
        pin?: string;
      }>;
    };

    expect(replaceCall).toBeDefined();
    expect(replaceCall.document_id).toBe('dds-1');
    expect(replaceCall.document_type).toBe('DDS');
    expect(replaceCall.authenticated_user_id).toBe('operador-1');
    expect(replaceCall.signatures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 'user-1',
          signer_user_id: 'user-1',
          type: 'hmac',
          pin: '1234',
        }),
        expect.objectContaining({
          user_id: 'facilitador-1',
          signer_user_id: 'facilitador-1',
          type: 'team_photo_1',
        }),
      ]),
    );

    // Justificativa de reuso de foto agora é salva na coluna dds.photo_reuse_justification,
    // não mais como uma entrada na tabela de assinaturas.
    const [, updatedPayload] = transactionalDdsRepository.update.mock
      .calls[0] as [string, { photo_reuse_justification?: string }];
    expect(transactionalDdsRepository.update).toHaveBeenCalledWith(
      'dds-1',
      expect.any(Object),
    );
    expect(updatedPayload.photo_reuse_justification).toContain(
      'indisponibilidade',
    );
  });

  it('getHistoricalPhotoHashes: aplica company_id informado quando nao existe tenant', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    const serviceWithoutTenant = new DdsService(
      repository as unknown as Repository<Dds>,
      {
        getTenantId: jest.fn(() => null),
      } as unknown as TenantService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentVideosService as DocumentVideosService,
      signaturesService as SignaturesService,
    );

    await serviceWithoutTenant.getHistoricalPhotoHashes(
      50,
      undefined,
      'company-99',
    );

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'dds.company_id = :companyScopeId',
      { companyScopeId: 'company-99' },
    );
    expect(signaturesService.findManyByDocuments).toHaveBeenCalledWith(
      [],
      'DDS',
      expect.objectContaining({ companyId: 'company-99' }),
    );
  });

  it('getHistoricalPhotoHashes: prioriza tenant sobre company_id informado', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await service.getHistoricalPhotoHashes(50, undefined, 'company-externa');

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'dds.company_id = :companyScopeId',
      { companyScopeId: 'company-1' },
    );
    expect(signaturesService.findManyByDocuments).toHaveBeenCalledWith(
      [],
      'DDS',
      expect.objectContaining({ companyId: 'company-1' }),
    );
  });
});
