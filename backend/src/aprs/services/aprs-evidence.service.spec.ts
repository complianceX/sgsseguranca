import { Repository } from 'typeorm';
import type { TenantService } from '../../common/tenant/tenant.service';
import type { DocumentStorageService } from '../../common/services/document-storage.service';
import { AprLog } from '../entities/apr-log.entity';
import { Apr, AprStatus } from '../entities/apr.entity';
import { AprsEvidenceService } from './aprs-evidence.service';

describe('AprsEvidenceService', () => {
  let service: AprsEvidenceService;

  let aprRepository: {
    findOne: jest.Mock;
    manager: {
      getRepository: jest.Mock;
    };
  };
  let aprLogsRepository: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let tenantService: Pick<TenantService, 'getTenantId' | 'getContext'>;
  let documentStorageService: Pick<
    DocumentStorageService,
    'generateDocumentKey' | 'uploadFile' | 'deleteFile' | 'getSignedUrl'
  >;

  beforeEach(() => {
    aprRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn(),
      },
    };
    aprLogsRepository = {
      create: jest.fn((input: Partial<AprLog>) => input as AprLog),
      save: jest.fn(() => Promise.resolve()),
    };
    tenantService = {
      getTenantId: jest.fn(() => 'company-1'),
      getContext: jest.fn(() => ({ siteScope: 'all', companyId: 'company-1', isSuperAdmin: false })),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/apr-evidences/apr-1/evidence.jpg',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn((key: string) =>
        Promise.resolve(`https://signed.example/${encodeURIComponent(key)}`),
      ),
    };

    service = new AprsEvidenceService(
      aprRepository as unknown as Repository<Apr>,
      aprLogsRepository as unknown as Repository<AprLog>,
      tenantService as TenantService,
      documentStorageService as DocumentStorageService,
    );
  });

  it('uploadRiskEvidence grava evidência governada e retorna hash SHA-256', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.PENDENTE,
      pdf_file_key: null,
      elaborador_id: 'user-1',
      participants: [],
    } as Apr);

    const riskItemRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'risk-1',
        apr_id: 'apr-1',
      }),
    };
    const evidenceRepository = {
      create: jest.fn((input: Record<string, unknown>) => input),
      save: jest.fn((input: Record<string, unknown>) =>
        Promise.resolve({
          ...input,
          id: 'evidence-1',
        }),
      ),
    };
    aprRepository.manager.getRepository.mockImplementation(
      (entity: { name?: string }) => {
        if (entity?.name === 'AprRiskItem') {
          return riskItemRepository;
        }
        return evidenceRepository;
      },
    );

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
        latitude: -23.55,
        longitude: -46.63,
      },
      'user-1',
      '127.0.0.1',
    );

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/apr-evidences/apr-1/evidence.jpg',
      file.buffer,
      'image/jpeg',
    );
    expect(result).toMatchObject({
      id: 'evidence-1',
      fileKey: 'documents/company-1/apr-evidences/apr-1/evidence.jpg',
      originalName: 'evidence.jpg',
    });
    expect(result.hashSha256).toHaveLength(64);
  });

  it('verifyEvidenceByHashPublic retorna evidência pública quando hash existe', async () => {
    aprRepository.manager.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({
        hash_sha256: 'a'.repeat(64),
        watermarked_hash_sha256: null,
        apr: { numero: 'APR-001', versao: 2 },
        apr_risk_item: { ordem: 1 },
        uploaded_at: new Date('2026-03-24T12:00:00.000Z'),
        integrity_flags: { gps: true },
      }),
    });

    const result = await service.verifyEvidenceByHashPublic('a'.repeat(64));

    expect(result).toEqual({
      verified: true,
      matchedIn: 'original',
    });
  });

  it('listAprEvidences retorna evidências com URLs assinadas', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
    } as Apr);

    aprRepository.manager.getRepository.mockReturnValue({
      find: jest.fn().mockResolvedValue([
        {
          id: 'evidence-1',
          apr_id: 'apr-1',
          apr_risk_item_id: 'risk-1',
          uploaded_by_id: 'user-1',
          uploaded_by: { nome: 'Carlos' },
          file_key: 'documents/company-1/apr-evidences/apr-1/evidence-1.jpg',
          original_name: 'evidence-1.jpg',
          mime_type: 'image/jpeg',
          file_size_bytes: 1024,
          hash_sha256: 'hash-1',
          watermarked_file_key:
            'documents/company-1/apr-evidences/apr-1/evidence-1-watermarked.jpg',
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
      ]),
    });

    const result = await service.listAprEvidences('apr-1');

    expect(documentStorageService.getSignedUrl).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      id: 'evidence-1',
      uploaded_by_name: 'Carlos',
      risk_item_ordem: 3,
      latitude: -23.5505,
      longitude: -46.6333,
      accuracy_m: 5.4,
    });
    expect(result[0]?.url).toContain('documents%2Fcompany-1%2Fapr-evidences');
    expect(result[0]?.watermarked_url).toContain('watermarked');
  });
});
