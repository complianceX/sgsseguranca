import { Repository } from 'typeorm';
import { AprsService } from './aprs.service';
import { Apr, AprStatus } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { RiskCalculationService } from '../common/services/risk-calculation.service';
import type { DocumentBundleService } from '../common/services/document-bundle.service';
import type { S3Service } from '../common/storage/s3.service';
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
  let s3Service: Pick<S3Service, 'generateDocumentKey' | 'uploadFile'>;
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
    s3Service = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/aprs/apr-1/apr-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
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
      {} as DocumentBundleService,
      s3Service as S3Service,
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

    expect(s3Service.uploadFile).toHaveBeenCalledWith(
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
        status: AprStatus;
        aprovado_por_id: string | null;
        aprovado_motivo: string;
      },
    ];
    expect(id).toBe('apr-1');
    expect(payload.pdf_file_key).toBe(
      'documents/company-1/aprs/apr-1/apr-final.pdf',
    );
    expect(payload.status).toBe(AprStatus.APROVADA);
    expect(payload.aprovado_por_id).toBe('user-1');
    expect(payload.aprovado_motivo).toBe('PDF assinado anexado');
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
});
