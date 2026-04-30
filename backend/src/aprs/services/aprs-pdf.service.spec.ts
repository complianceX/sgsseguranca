import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import type { TenantService } from '../../common/tenant/tenant.service';
import type { DocumentStorageService } from '../../common/services/document-storage.service';
import type { PdfService } from '../../common/services/pdf.service';
import type { DocumentGovernanceService } from '../../document-registry/document-governance.service';
import type { SignaturesService } from '../../signatures/signatures.service';
import { AprLog } from '../entities/apr-log.entity';
import { Apr, AprStatus } from '../entities/apr.entity';
import { AprsPdfService } from './aprs-pdf.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];

describe('AprsPdfService', () => {
  let service: AprsPdfService;

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
  let pdfService: Pick<PdfService, 'generateFromHtml'>;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument'
  >;
  let signaturesService: Pick<SignaturesService, 'findByDocument'>;

  beforeEach(() => {
    const update = jest.fn();
    const findEvidences = jest.fn().mockResolvedValue([]);

    aprRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn((entity: { name?: string }) => {
          if (entity?.name === 'Apr') {
            return { update };
          }
          if (entity?.name === 'AprRiskEvidence') {
            return { find: findEvidences };
          }
          return {};
        }),
      },
    };

    aprLogsRepository = {
      create: jest.fn((input: Partial<AprLog>) => input as unknown as AprLog),
      save: jest.fn(() => Promise.resolve()),
    };
    tenantService = {
      getTenantId: jest.fn(() => 'company-1'),
      getContext: jest.fn(() => ({
        siteScope: 'all',
        companyId: 'company-1',
        isSuperAdmin: false,
      })),
    };
    documentStorageService = {
      generateDocumentKey: jest.fn(
        () => 'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn((key: string) =>
        Promise.resolve(`https://signed.example/${encodeURIComponent(key)}`),
      ),
    };
    pdfService = {
      generateFromHtml: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(
        async (input: RegisterFinalDocumentInput) => {
          await input.persistEntityMetadata?.(
            aprRepository.manager as unknown as EntityManager,
            'hash-1',
          );
          return {
            hash: 'hash-1',
            registryEntry: { id: 'registry-1' },
          } as never;
        },
      ),
    };
    signaturesService = {
      findByDocument: jest.fn(() =>
        Promise.resolve([{ user_id: 'user-1' }] as unknown as Awaited<
          ReturnType<SignaturesService['findByDocument']>
        >),
      ),
    };

    service = new AprsPdfService(
      aprRepository as unknown as Repository<Apr>,
      aprLogsRepository as unknown as Repository<AprLog>,
      tenantService as TenantService,
      documentStorageService as DocumentStorageService,
      pdfService as PdfService,
      documentGovernanceService as DocumentGovernanceService,
      signaturesService as SignaturesService,
      { issueToken: jest.fn().mockResolvedValue('token-publico') } as never,
      { getPresignedInlineViewUrl: jest.fn().mockResolvedValue(null) } as never,
    );
  });

  it('storeFinalPdfBuffer salva no storage governado e persiste metadados na APR', async () => {
    const apr = {
      id: 'apr-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
    } as unknown as Apr;
    const buffer = Buffer.from('%PDF-apr');

    const result = await service.storeFinalPdfBuffer(apr, {
      buffer,
      originalName: 'apr-final.pdf',
      mimeType: 'application/pdf',
      userId: 'user-1',
    });

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
      buffer,
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'apr',
        entityId: 'apr-1',
        fileKey: 'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
        createdBy: 'user-1',
      }),
    );
    expect(result).toEqual({
      fileKey: 'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
      folderPath: 'documents/company-1/aprs/sites/site-1/apr-1',
      originalName: 'apr-final.pdf',
    });
  });

  it('storeFinalPdfBuffer exclui arquivo do storage quando governance lança erro', async () => {
    const apr = {
      id: 'apr-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
    } as unknown as Apr;

    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance falhou'));

    await expect(
      service.storeFinalPdfBuffer(apr, {
        buffer: Buffer.from('%PDF-apr'),
        originalName: 'apr-final.pdf',
        mimeType: 'application/pdf',
        userId: 'user-1',
      }),
    ).rejects.toThrow('governance falhou');

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
    );
  });

  it('attachPdf valida prontidão da APR e registra o anexo final', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      site_id: 'site-1',
      titulo: 'APR Torre',
      numero: 'APR-001',
      status: AprStatus.APROVADA,
      data_inicio: new Date('2026-03-14T10:00:00.000Z'),
      created_at: new Date('2026-03-14T09:00:00.000Z'),
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).resolves.toEqual({
      fileKey: 'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
      folderPath: 'documents/company-1/aprs/sites/site-1/apr-1',
      originalName: 'apr-final.pdf',
    });

    expect(signaturesService.findByDocument).toHaveBeenCalledWith(
      'apr-1',
      'APR',
    );
  });

  it('attachPdf lança NotFoundException quando APR não existe', async () => {
    aprRepository.findOne.mockResolvedValue(null);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(
      service.attachPdf('inexistente', file, 'user-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('attachPdf lança BadRequestException quando APR já possui PDF', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      site_id: 'site-1',
      status: AprStatus.APROVADA,
      pdf_file_key: 'documents/company-1/aprs/apr-1/existing.pdf',
      is_modelo: false,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('attachPdf lança BadRequestException quando APR não está aprovada', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
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
      BadRequestException,
    );
  });

  it('attachPdf lança BadRequestException para modelo de APR', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: true,
      participants: [{ id: 'user-1' }],
    } as unknown as Apr);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('attachPdf lança BadRequestException quando participante não assinou', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: false,
      participants: [{ id: 'user-1' }, { id: 'user-2' }],
    } as unknown as Apr);

    (signaturesService.findByDocument as jest.Mock).mockResolvedValue([
      { user_id: 'user-1' },
    ] as never);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('attachPdf lança BadRequestException quando não há participantes', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      status: AprStatus.APROVADA,
      pdf_file_key: null,
      is_modelo: false,
      participants: [],
    } as unknown as Apr);

    const file = {
      originalname: 'apr-final.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-apr'),
    } as Express.Multer.File;

    await expect(service.attachPdf('apr-1', file, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('generateFinalPdf retorna acesso existente sem regerar quando PDF já existe', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      pdf_file_key: 'documents/company-1/aprs/apr-1/existing.pdf',
      pdf_folder_path: 'aprs/company-1',
      pdf_original_name: 'APR-001_v1.pdf',
    } as unknown as Apr);

    const result = await service.generateFinalPdf('apr-1', 'user-1');

    expect(pdfService.generateFromHtml).not.toHaveBeenCalled();
    expect(result.generated).toBe(false);
    expect(result.hasFinalPdf).toBe(true);
    expect(result.entityId).toBe('apr-1');
  });

  it('generateFinalPdf gera PDF oficial e retorna acesso governado', async () => {
    aprRepository.findOne
      .mockResolvedValueOnce({
        id: 'apr-1',
        company_id: 'company-1',
        pdf_file_key: null,
        pdf_folder_path: null,
        pdf_original_name: null,
      } as unknown as Apr)
      .mockResolvedValueOnce({
        id: 'apr-1',
        company_id: 'company-1',
        site_id: 'site-1',
        titulo: 'APR Torre',
        numero: 'APR-001',
        status: AprStatus.APROVADA,
        data_inicio: new Date('2026-03-14T10:00:00.000Z'),
        data_fim: new Date('2026-03-20T10:00:00.000Z'),
        created_at: new Date('2026-03-14T09:00:00.000Z'),
        updated_at: new Date('2026-03-14T09:30:00.000Z'),
        pdf_file_key: null,
        is_modelo: false,
        participants: [{ id: 'user-1', nome: 'Maria' }],
        company: {
          razao_social: 'Empresa Teste',
          cnpj: '00.000.000/0001-00',
        },
        site: { nome: 'Obra Centro' },
        elaborador: { nome: 'Maria' },
        risk_items: [],
      } as unknown as Apr)
      .mockResolvedValueOnce(null) // supersedingRow check — no superseding APR
      .mockResolvedValueOnce({
        id: 'apr-1',
        company_id: 'company-1',
        site_id: 'site-1',
        pdf_file_key: 'documents/company-1/aprs/apr-1/apr-final.pdf',
        pdf_folder_path: 'aprs/company-1',
        pdf_original_name: 'APR-001_v1.pdf',
      } as unknown as Apr);

    const result = await service.generateFinalPdf('apr-1', 'user-1');

    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('APR - ANÁLISE PRELIMINAR DE RISCOS'),
      expect.objectContaining({
        format: 'A4',
        landscape: true,
        preferCssPageSize: true,
      }),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('size: A4 landscape;'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('APR - ANÁLISE PRELIMINAR DE RISCOS'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('Reconhecimento de Riscos'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('Medidas de Prevenção'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('critério de ação'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('Assinaturas registradas'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('.apr-risk-table'),
      expect.any(Object),
    );
    expect(pdfService.generateFromHtml).toHaveBeenCalledWith(
      expect.stringContaining('.risk-badge--critical'),
      expect.any(Object),
    );
    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/aprs/sites/site-1/apr-1/apr-final.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(result).toMatchObject({
      entityId: 'apr-1',
      generated: true,
      hasFinalPdf: true,
    });
  });

  it('regeneratePdfWithSupersededWatermark retorna silenciosamente quando APR sem PDF', async () => {
    aprRepository.findOne.mockResolvedValue({
      id: 'apr-1',
      company_id: 'company-1',
      pdf_file_key: null,
    } as unknown as Apr);

    await expect(
      service.regeneratePdfWithSupersededWatermark('apr-1', 'user-1'),
    ).resolves.toBeUndefined();

    expect(pdfService.generateFromHtml).not.toHaveBeenCalled();
  });

  it('regeneratePdfWithSupersededWatermark silencia erros internos', async () => {
    aprRepository.findOne.mockRejectedValue(new Error('db offline'));

    await expect(
      service.regeneratePdfWithSupersededWatermark('apr-1', 'user-1'),
    ).resolves.toBeUndefined();

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });
});
