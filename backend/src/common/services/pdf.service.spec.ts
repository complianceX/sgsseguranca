import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { DocumentRegistryEntry } from '../../document-registry/entities/document-registry.entity';
import { PdfIntegrityRecord } from '../entities/pdf-integrity-record.entity';
import { PdfService } from './pdf.service';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { PdfValidatorService } from './pdf-validator.service';

describe('PdfService', () => {
  let service: PdfService;
  let integrityRepository: {
    upsert: jest.MockedFunction<Repository<PdfIntegrityRecord>['upsert']>;
    findOne: jest.MockedFunction<Repository<PdfIntegrityRecord>['findOne']>;
  };
  let registryRepository: {
    findOne: jest.MockedFunction<Repository<DocumentRegistryEntry>['findOne']>;
  };
  let puppeteerPool: Partial<PuppeteerPoolService>;
  let pdfValidator: Partial<PdfValidatorService>;

  beforeEach(() => {
    integrityRepository = {
      upsert: jest.fn(),
      findOne: jest.fn(),
    };
    registryRepository = {
      findOne: jest.fn(),
    };
    puppeteerPool = {};
    pdfValidator = {
      validateHtmlContent: jest.fn(),
      validatePdfBuffer: jest.fn(),
    };

    service = new PdfService(
      integrityRepository as Repository<PdfIntegrityRecord>,
      registryRepository as Repository<DocumentRegistryEntry>,
      puppeteerPool as PuppeteerPoolService,
      pdfValidator as PdfValidatorService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persiste hash real ao assinar PDF', async () => {
    const buffer = Buffer.from('pdf-binary-content');
    const expectedHash = createHash('sha256').update(buffer).digest('hex');

    await expect(
      service.signAndSave(buffer, {
        originalName: 'laudo.pdf',
        signedByUserId: 'user-1',
        companyId: 'company-1',
      }),
    ).resolves.toBe(expectedHash);

    expect(integrityRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: expectedHash,
        original_name: 'laudo.pdf',
        signed_by_user_id: 'user-1',
        company_id: 'company-1',
      }),
      ['hash'],
    );
  });

  it('registra o autor operacional quando a integridade vem da esteira documental', async () => {
    const buffer = Buffer.from('pdf-governed-content');
    const expectedHash = createHash('sha256').update(buffer).digest('hex');

    await expect(
      service.registerBufferIntegrity(buffer, {
        originalName: 'checklist-final.pdf',
        recordedByUserId: 'user-2',
        companyId: 'company-9',
      }),
    ).resolves.toBe(expectedHash);

    expect(integrityRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: expectedHash,
        original_name: 'checklist-final.pdf',
        signed_by_user_id: 'user-2',
        company_id: 'company-9',
      }),
      ['hash'],
    );
  });

  it('retorna invalid=false quando hash nao existe', async () => {
    integrityRepository.findOne.mockResolvedValue(null);

    await expect(service.verify('missing-hash')).resolves.toEqual({
      hash: 'missing-hash',
      valid: false,
    });
  });

  it('enriquece verify com contexto governado quando o registry existe', async () => {
    integrityRepository.findOne.mockResolvedValue({
      original_name: 'relatorio.pdf',
      created_at: new Date('2026-03-14T16:00:00.000Z'),
      company_id: 'company-1',
    } as PdfIntegrityRecord);
    registryRepository.findOne.mockResolvedValue({
      module: 'checklist',
      entity_id: 'checklist-1',
      document_type: 'pdf',
      document_code: 'CHECKLIST-2026-11-ABCD1234',
      file_key: 'documents/company-1/checklists/doc.pdf',
      original_name: 'checklist.pdf',
    } as DocumentRegistryEntry);

    await expect(service.verify('known-hash')).resolves.toEqual({
      hash: 'known-hash',
      valid: true,
      originalName: 'relatorio.pdf',
      signedAt: '2026-03-14T16:00:00.000Z',
      document: {
        module: 'checklist',
        entityId: 'checklist-1',
        documentType: 'pdf',
        documentCode: 'CHECKLIST-2026-11-ABCD1234',
        fileKey: 'documents/company-1/checklists/doc.pdf',
        originalName: 'checklist.pdf',
      },
    });

    expect(registryRepository.findOne).toHaveBeenCalledWith({
      where: { file_hash: 'known-hash', company_id: 'company-1' },
      order: { updated_at: 'DESC' },
    });
  });

  it('mantem contrato compatível quando o hash existe sem registry relacionado', async () => {
    integrityRepository.findOne.mockResolvedValue({
      original_name: null,
      created_at: new Date('2026-03-14T16:00:00.000Z'),
      company_id: 'company-1',
    } as PdfIntegrityRecord);
    registryRepository.findOne.mockResolvedValue(null);

    await expect(service.verify('known-hash')).resolves.toEqual({
      hash: 'known-hash',
      valid: true,
      originalName: null,
      signedAt: '2026-03-14T16:00:00.000Z',
      document: undefined,
    });
  });
});
