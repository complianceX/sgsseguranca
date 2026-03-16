import { Repository } from 'typeorm';
import { AprsService } from './aprs.service';
import { Apr, AprStatus } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { RiskCalculationService } from '../common/services/risk-calculation.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

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
    'generateDocumentKey' | 'uploadFile' | 'deleteFile'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument' | 'removeFinalDocumentReference'
  >;

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
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
    };

    service = new AprsService(
      aprRepository as unknown as Repository<Apr>,
      aprLogsRepository as unknown as Repository<AprLog>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as RiskCalculationService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
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
});
