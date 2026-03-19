import { Repository } from 'typeorm';
import { AprsService } from './aprs.service';
import { Apr, AprStatus } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { RiskCalculationService } from '../common/services/risk-calculation.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { SignaturesService } from '../signatures/signatures.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];
type EvidenceRepositoryInput = Record<string, unknown>;
type RepositoryEntityName = { name?: string };

describe('AprsService', () => {
  let service: AprsService;
  let aprRepository: {
    findOne: jest.Mock;
  };
  let aprLogsRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'deleteFile' | 'getSignedUrl'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;
  let signaturesService: Pick<SignaturesService, 'findByDocument'>;

  beforeEach(() => {
    aprRepository = {
      findOne: jest.fn(),
    };
    aprLogsRepository = {
      create: jest.fn((input: Partial<AprLog>) => input as AprLog),
      save: jest.fn(() => Promise.resolve()),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/aprs/apr-1/apr-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn((key: string) =>
        Promise.resolve(`https://signed.example/${encodeURIComponent(key)}`),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };
    signaturesService = {
      findByDocument: jest.fn(() => Promise.resolve([{ user_id: 'user-1' }])),
    };

    service = new AprsService(
      aprRepository as unknown as Repository<Apr>,
      aprLogsRepository as unknown as Repository<AprLog>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as RiskCalculationService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      signaturesService as SignaturesService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('anexa o PDF final da APR pela esteira central no ponto de fechamento documental', async () => {
    const apr = {
      id: 'apr-1',
      company_id: 'company-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    aprRepository.findOne.mockResolvedValue(apr);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).resolves.toEqual({
      fileKey: 'documents/company-1/aprs/apr-1/apr-final.pdf',
      folderPath: 'aprs/company-1',
      originalName: 'apr-final.pdf',
    });

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/apr-1/apr-final.pdf',
      file.buffer,
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        documentCode: 'APR-2026-APR1',
        module: 'apr',
        entityId: 'apr-1',
        fileKey: 'documents/company-1/aprs/apr-1/apr-final.pdf',
        fileBuffer: file.buffer,
        createdBy: 'user-1',
      }),
    );
    const [id, payload] = update.mock.calls[0] as [
      string,
      {
        pdf_file_key: string;
        pdf_original_name: string;
      },
    ];
    expect(id).toBe('apr-1');
    expect(payload.pdf_file_key).toBe(
      'documents/company-1/aprs/apr-1/apr-final.pdf',
    );
    expect(payload.pdf_original_name).toBe('apr-final.pdf');
  });

  it('bloqueia anexo final quando a APR ainda nao foi aprovada', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      status: AprStatus.PENDENTE,
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      'A APR precisa estar aprovada antes do anexo do PDF final.',
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('remove a APR via esteira central e aplica a policy de lifecycle', async () => {
    const apr = {
      id: 'apr-1',
      company_id: 'company-1',
    } as Apr;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    aprRepository.findOne.mockResolvedValue(apr);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(service.remove('apr-1', 'user-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('apr');
    expect(removeInput.entityId).toBe('apr-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('apr-1');
  });

  it('remove o arquivo da APR do storage quando a governanca falha depois do upload', async () => {
    const apr = {
      id: 'apr-1',
      company_id: 'company-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr;
    aprRepository.findOne.mockResolvedValue(apr);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      'governance failed',
    );

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/apr-1/apr-final.pdf',
    );
  });

  it('bloqueia anexo final quando faltam assinaturas dos participantes', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }, { id: 'user-2' }],
    } as unknown as Apr);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      { user_id: 'user-1' },
    ]);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      'Todos os participantes precisam assinar a APR antes do PDF final.',
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('bloqueia alteracao de status via endpoint update (bypass de workflow)', async () => {
    await expect(
      service.update('apr-1', { status: 'Aprovada' } as never),
    ).rejects.toThrow(
      'Use os endpoints /approve, /reject ou /finalize para alterar o status da APR.',
    );

    expect(aprRepository.findOne).not.toHaveBeenCalled();
  });

  it('bloqueia criacao de nova versao quando APR nao esta aprovada', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.PENDENTE,
      numero: 'APR-001',
      versao: 1,
      pdf_file_key: null,
    } as unknown as Apr);

    await expect(service.createNewVersion('apr-1', 'user-1')).rejects.toThrow(
      'Somente APRs Aprovadas podem gerar nova versão.',
    );
  });

  it('lista evidencias da APR com URLs assinadas quando disponiveis', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'evidence-1',
        apr_id: 'apr-1',
        apr_risk_item_id: 'risk-1',
        uploaded_by_id: 'user-1',
        uploaded_by: { nome: 'Carlos' },
        file_key: 'documents/company-1/aprs/apr-1/evidence-1.jpg',
        original_name: 'evidence-1.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 1024,
        hash_sha256: 'hash-1',
        watermarked_file_key:
          'documents/company-1/aprs/apr-1/evidence-1-watermarked.jpg',
        watermarked_hash_sha256: 'hash-watermarked-1',
        watermark_text: 'APR-001',
        captured_at: new Date('2026-03-16T10:00:00.000Z'),
        uploaded_at: new Date('2026-03-16T10:05:00.000Z'),
        latitude: '-23.5505',
        longitude: '-46.6333',
        accuracy_m: '5.4',
        device_id: 'device-1',
        ip_address: '127.0.0.1',
        exif_datetime: new Date('2026-03-16T09:59:00.000Z'),
        integrity_flags: { gps: true },
        apr_risk_item: { ordem: 3 },
      },
    ]);
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
    } as Apr);
    (aprRepository as unknown as { manager: unknown }).manager = {
      getRepository: jest.fn(() => ({ find })),
    };

    const result = (await service.listAprEvidences('apr-1')) as Array<{
      id: string;
      uploaded_by_name?: string;
      risk_item_ordem?: number;
      latitude?: number;
      longitude?: number;
      accuracy_m?: number;
      url?: string;
      watermarked_url?: string;
    }>;

    expect(find).toHaveBeenCalledWith({
      where: { apr_id: 'apr-1' },
      relations: ['apr_risk_item', 'uploaded_by'],
      order: { uploaded_at: 'DESC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'evidence-1',
      uploaded_by_name: 'Carlos',
      risk_item_ordem: 3,
      latitude: -23.5505,
      longitude: -46.6333,
      accuracy_m: 5.4,
    });
    expect(result[0]?.url).toContain('documents%2Fcompany-1%2Faprs');
    expect(result[0]?.watermarked_url).toContain('watermarked');
  });

  it('salva evidencias fotograficas da APR no storage e registra o hash', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      pdf_file_key: null,
    } as Apr);

    const riskItemRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'risk-1',
        apr_id: 'apr-1',
        ordem: 0,
      }),
    };
    const save = jest.fn((input: EvidenceRepositoryInput) =>
      Promise.resolve({
        ...input,
        id: 'evidence-1',
      }),
    );
    const evidenceRepository = {
      create: jest.fn((input: EvidenceRepositoryInput) => input),
      save,
    };
    (aprRepository as unknown as { manager: unknown }).manager = {
      getRepository: jest.fn((entity: RepositoryEntityName) => {
        if (entity.name === 'AprRiskItem') return riskItemRepository;
        return evidenceRepository;
      }),
    };

    const file = {
      originalname: 'evidence.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]),
      size: 5,
    } as Express.Multer.File;

    const result = await service.uploadRiskEvidence(
      'apr-1',
      'risk-1',
      file,
      {
        captured_at: '2026-03-16T10:00:00.000Z',
        latitude: -23.55,
        longitude: -46.63,
        accuracy_m: 4.2,
        device_id: 'pixel',
      },
      'user-1',
      '127.0.0.1',
    );

    expect(result).toMatchObject({
      id: 'evidence-1',
      fileKey: 'documents/company-1/aprs/apr-1/apr-final.pdf',
      originalName: 'evidence.jpg',
    });
    expect(typeof result.hashSha256).toBe('string');
    expect(result.hashSha256).toBeTruthy();

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/apr-1/apr-final.pdf',
      file.buffer,
      'image/jpeg',
    );
    expect(evidenceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apr_id: 'apr-1',
        apr_risk_item_id: 'risk-1',
        uploaded_by_id: 'user-1',
        file_key: 'documents/company-1/aprs/apr-1/apr-final.pdf',
        original_name: 'evidence.jpg',
        mime_type: 'image/jpeg',
        file_size_bytes: 5,
        ip_address: '127.0.0.1',
      }),
    );
  });
});
