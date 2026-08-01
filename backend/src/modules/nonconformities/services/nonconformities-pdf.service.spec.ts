import { EntityManager, Repository } from 'typeorm';
import type { TenantService } from '../../../shared/tenant/tenant.service';
import type { DocumentStorageService } from '../../../shared/services/document-storage.service';
import type { StorageService } from '../../../shared/services/storage.service';
import type { PdfService } from '../../../shared/services/pdf.service';
import type { DocumentGovernanceService } from '../../document-registry/document-governance.service';
import { NonConformity } from '../entities/nonconformity.entity';
import { NcStatus } from '../nonconformities.service';
import { NonConformitiesPdfService } from './nonconformities-pdf.service';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];

describe('NonConformitiesPdfService', () => {
  let service: NonConformitiesPdfService;

  let ncRepository: {
    findOne: jest.Mock;
    manager: { getRepository: jest.Mock };
  };
  let tenantService: Pick<TenantService, 'getTenantId' | 'getContext'>;
  let documentStorageService: Pick<
    DocumentStorageService,
    | 'generateDocumentKey'
    | 'uploadFile'
    | 'deleteFile'
    | 'getSignedUrl'
    | 'downloadFileBuffer'
  >;
  let storageService: Pick<StorageService, 'getPresignedInlineViewUrl'>;
  let pdfService: Pick<PdfService, 'generateFromHtml'>;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    'registerFinalDocument'
  >;

  const baseNc = {
    id: 'nc-1',
    company_id: 'company-1',
    site_id: 'site-1',
    codigo_nc: 'NC-001',
    tipo: 'Operacional',
    data_identificacao: new Date('2026-03-10T00:00:00.000Z'),
    created_at: new Date('2026-03-09T00:00:00.000Z'),
    local_setor_area: 'Área 1',
    atividade_envolvida: 'Inspeção',
    responsavel_area: 'Equipe',
    auditor_responsavel: 'Auditor',
    descricao: 'Descrição do desvio',
    evidencia_observada: 'Evidência',
    condicao_insegura: 'Condição insegura',
    requisito_nr: 'NR-12',
    requisito_item: '12.1',
    risco_perigo: 'Perigo',
    risco_associado: 'Risco',
    risco_nivel: 'Alto',
    status: NcStatus.ABERTA,
    anexos: [],
    pdf_file_key: null,
    verification_code: null,
  } as unknown as NonConformity;

  beforeEach(() => {
    const update = jest.fn();

    ncRepository = {
      findOne: jest.fn(),
      manager: {
        getRepository: jest.fn(() => ({ update })),
      },
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
        () =>
          'documents/company-1/nonconformities/sites/site-1/nc-1/nc-final.pdf',
      ),
      uploadFile: jest.fn(() => Promise.resolve()),
      deleteFile: jest.fn(() => Promise.resolve()),
      getSignedUrl: jest.fn((key: string) =>
        Promise.resolve(`https://signed.example/${encodeURIComponent(key)}`),
      ),
      downloadFileBuffer: jest.fn(() => Promise.resolve(Buffer.from('img'))),
    };
    storageService = {
      getPresignedInlineViewUrl: jest.fn().mockResolvedValue(null),
    };
    pdfService = {
      generateFromHtml: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(
        async (input: RegisterFinalDocumentInput) => {
          await input.persistEntityMetadata?.(
            ncRepository.manager as unknown as EntityManager,
            'hash-1',
          );
          return {
            hash: 'hash-1',
            registryEntry: { id: 'registry-1' },
          } as never;
        },
      ),
    };

    service = new NonConformitiesPdfService(
      ncRepository as unknown as Repository<NonConformity>,
      tenantService as TenantService,
      documentStorageService as DocumentStorageService,
      storageService as StorageService,
      pdfService as PdfService,
      documentGovernanceService as DocumentGovernanceService,
    );
  });

  it('getPdfAccess sinaliza not_emitted quando a NC não tem PDF final', async () => {
    ncRepository.findOne.mockResolvedValue({ ...baseNc, pdf_file_key: null });

    await expect(service.getPdfAccess('nc-1')).resolves.toMatchObject({
      hasFinalPdf: false,
      availability: 'not_emitted',
    });
  });

  it('getPdfAccess retorna ready com URL assinada quando já existe PDF', async () => {
    ncRepository.findOne.mockResolvedValue({
      ...baseNc,
      pdf_file_key: 'documents/company-1/nonconformities/nc-1/existing.pdf',
      pdf_original_name: 'NC-001.pdf',
    });

    await expect(service.getPdfAccess('nc-1')).resolves.toMatchObject({
      hasFinalPdf: true,
      availability: 'ready',
      url: expect.stringContaining('https://signed.example/'),
    });
  });

  it('generateFinalPdf gera o PDF oficial e registra no storage governado', async () => {
    ncRepository.findOne.mockResolvedValue({ ...baseNc });

    const result = await service.generateFinalPdf('nc-1', 'user-1');

    expect(pdfService.generateFromHtml).toHaveBeenCalled();
    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      'documents/company-1/nonconformities/sites/site-1/nc-1/nc-final.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'nonconformity', entityId: 'nc-1' }),
    );
    expect(result.generated).toBe(true);
    expect(documentStorageService.deleteFile).not.toHaveBeenCalled();
  });

  it('generateFinalPdf é idempotente quando a NC está encerrada e já tem PDF', async () => {
    ncRepository.findOne.mockResolvedValue({
      ...baseNc,
      status: NcStatus.ENCERRADA,
      pdf_file_key: 'documents/company-1/nonconformities/nc-1/existing.pdf',
    });

    const result = await service.generateFinalPdf('nc-1', 'user-1');

    expect(pdfService.generateFromHtml).not.toHaveBeenCalled();
    expect(result.generated).toBe(false);
    expect(result.hasFinalPdf).toBe(true);
  });

  it('generateFinalPdf regenera e remove o PDF anterior quando a NC ainda está editável', async () => {
    ncRepository.findOne.mockResolvedValue({
      ...baseNc,
      status: NcStatus.EM_ANDAMENTO,
      pdf_file_key: 'documents/company-1/nonconformities/nc-1/old.pdf',
    });

    const result = await service.generateFinalPdf('nc-1', 'user-1');

    expect(pdfService.generateFromHtml).toHaveBeenCalled();
    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/nonconformities/nc-1/old.pdf',
    );
    expect(result.generated).toBe(true);
  });

  it('generateFinalPdf remove o arquivo recém-enviado quando a governança falha', async () => {
    ncRepository.findOne.mockResolvedValue({ ...baseNc });
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance falhou'));

    await expect(service.generateFinalPdf('nc-1', 'user-1')).rejects.toThrow(
      'governance falhou',
    );

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      'documents/company-1/nonconformities/sites/site-1/nc-1/nc-final.pdf',
    );
  });
});
