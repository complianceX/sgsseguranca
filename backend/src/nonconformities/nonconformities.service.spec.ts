import { Repository } from 'typeorm';
import { NonConformitiesService } from './nonconformities.service';
import { NonConformity } from './entities/nonconformity.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { DocumentBundleService } from '../common/services/document-bundle.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { AuditService } from '../audit/audit.service';
import type { Site } from '../sites/entities/site.entity';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('NonConformitiesService', () => {
  let service: NonConformitiesService;
  let repository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let sitesRepository: {
    findOne: jest.Mock;
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    'uploadFile' | 'deleteFile' | 'getSignedUrl' | 'generateDocumentKey'
  >;
  let documentBundleService: Pick<DocumentBundleService, 'buildWeeklyPdfBundle'>;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    | 'registerFinalDocument'
    | 'removeFinalDocumentReference'
    | 'listFinalDocuments'
  >;

  beforeEach(() => {
    repository = {
      create: jest.fn((input: Partial<NonConformity>) => input),
      findOne: jest.fn(),
      save: jest.fn((input) =>
        Promise.resolve(input as unknown as NonConformity),
      ),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    sitesRepository = {
      findOne: jest.fn(),
    };
    documentStorageService = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn(() => Promise.resolve()),
      generateDocumentKey: jest.fn(
        (
          companyId: string,
          documentType: string,
          documentId: string,
          originalName: string,
        ) =>
          `documents/${companyId}/${documentType}/${documentId}/${originalName}`,
      ),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://example.com/nc.pdf'),
      ),
    };
    documentBundleService = {
      buildWeeklyPdfBundle: jest.fn(() =>
        Promise.resolve({
          buffer: Buffer.from('nc-bundle'),
          fileName: 'Nao_Conformidade-2026-W11.pdf',
        }),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
      listFinalDocuments: jest.fn(),
    };

    service = new NonConformitiesService(
      repository as unknown as Repository<NonConformity>,
      sitesRepository as unknown as Repository<Site>,
      {
        getTenantId: jest.fn(() => 'company-1'),
        getContext: jest.fn(() => ({
          companyId: 'company-1',
          isSuperAdmin: false,
          siteScope: 'all',
        })),
      } as unknown as TenantService,
      documentStorageService as DocumentStorageService,
      documentBundleService as DocumentBundleService,
      documentGovernanceService as DocumentGovernanceService,
      { log: jest.fn() } as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passa o documento final da NC pelo caminho central de governança', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
      codigo_nc: 'NC-001',
      tipo: 'Operacional',
      data_identificacao: new Date('2026-03-10T00:00:00.000Z'),
    } as unknown as NonConformity;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    repository.findOne.mockResolvedValue(nc);
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata?.(manager as never, 'hash-1');
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const buffer = Buffer.from('pdf-content');
    await service.attachPdf('nc-1', buffer, 'nc-001.pdf', 'application/pdf');

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('nc-1.pdf'),
      buffer,
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'nonconformity',
        entityId: 'nc-1',
        originalName: 'nc-001.pdf',
        mimeType: 'application/pdf',
        documentDate: nc.data_identificacao,
        fileBuffer: buffer,
      }),
    );
    const [updateCriteria, updatePayload] = update.mock.calls[0] as [
      { id: string },
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(updateCriteria).toEqual({ id: 'nc-1' });
    expect(updatePayload.pdf_file_key).toContain('/nc-1.pdf');
    expect(updatePayload.pdf_original_name).toBe('nc-001.pdf');
  });

  it('remove a NC via esteira central para limpar o registry corretamente', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
    } as unknown as NonConformity;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState?.(manager as never);
    });

    await expect(service.remove('nc-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('nonconformity');
    expect(removeInput.entityId).toBe('nc-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('nc-1');
  });

  it('remove o arquivo da NC do storage quando a governanca falha', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
      codigo_nc: 'NC-001',
      tipo: 'Operacional',
      data_identificacao: new Date('2026-03-10T00:00:00.000Z'),
    } as unknown as NonConformity;
    repository.findOne.mockResolvedValue(nc);
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    await expect(
      service.attachPdf(
        'nc-1',
        Buffer.from('pdf-content'),
        'nc-001.pdf',
        'application/pdf',
      ),
    ).rejects.toThrow('governance failed');

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      expect.stringContaining('nc-1.pdf'),
    );
  });

  it('bloqueia edicao quando a NC já possui PDF final emitido', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      pdf_file_key: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
    } as unknown as NonConformity);

    await expect(
      service.update('nc-1', { descricao: 'Novo texto' }),
    ).rejects.toThrow(
      'Não conformidade com PDF final anexado. Edição bloqueada. Gere uma nova NC para alterar o documento.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('filtra arquivos semanais pela data documental da NC', async () => {
    (
      documentGovernanceService.listFinalDocuments as jest.Mock
    ).mockResolvedValue([
      {
        entityId: 'nc-1',
        id: 'nc-1',
        title: 'NC-001',
        date: new Date('2025-12-31T00:00:00.000Z'),
        companyId: 'company-1',
        fileKey: 'nonconformities/company-1/2025/week-01/nc-1.pdf',
        folderPath: 'nonconformities/company-1/2025/week-01',
        originalName: 'nc-1.pdf',
        module: 'nonconformity',
      },
    ]);

    const files = await service.listStoredFiles({ year: 2025 });

    expect(files).toHaveLength(1);
    expect(files[0].entityId).toBe('nc-1');
    expect(documentGovernanceService.listFinalDocuments).toHaveBeenCalledWith(
      'nonconformity',
      { year: 2025 },
    );
  });

  it('retorna metadados do PDF mesmo quando a URL assinada falha', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      pdf_file_key: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
      pdf_folder_path: 'nonconformities/company-1/2026/week-11',
      pdf_original_name: 'nc-1.pdf',
    } as unknown as NonConformity);
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValueOnce(
      new Error('storage offline'),
    );

    await expect(service.getPdfAccess('nc-1')).resolves.toEqual({
      entityId: 'nc-1',
      hasFinalPdf: true,
      availability: 'registered_without_signed_url',
      fileKey: 'nonconformities/company-1/2026/week-11/nc-1.pdf',
      folderPath: 'nonconformities/company-1/2026/week-11',
      originalName: 'nc-1.pdf',
      url: null,
      message:
        'PDF final registrado, mas a URL segura do storage não está disponível no momento.',
    });
  });

  it('sinaliza explicitamente quando o PDF final ainda não foi emitido', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      pdf_file_key: null,
      pdf_folder_path: null,
      pdf_original_name: null,
    } as unknown as NonConformity);

    await expect(service.getPdfAccess('nc-1')).resolves.toEqual({
      entityId: 'nc-1',
      hasFinalPdf: false,
      availability: 'not_emitted',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
      message: 'PDF final ainda não foi emitido para esta não conformidade.',
    });
  });

  it('bloqueia criação com anexo inline acima do limite operacional', async () => {
    const oversizedInlineAttachment = `data:image/jpeg;base64,${Buffer.alloc(
      1024 * 1024 + 32,
      1,
    ).toString('base64')}`;

    await expect(
      service.create({
        codigo_nc: 'NC-001',
        tipo: 'Operacional',
        data_identificacao: '2026-03-10',
        local_setor_area: 'Área 1',
        atividade_envolvida: 'Inspeção',
        responsavel_area: 'Maria',
        auditor_responsavel: 'João',
        descricao: 'Descrição',
        evidencia_observada: 'Evidência',
        condicao_insegura: 'Condição',
        requisito_nr: 'NR-1',
        requisito_item: '1.1',
        risco_perigo: 'Perigo',
        risco_associado: 'Risco',
        risco_nivel: 'Alto',
        status: 'ABERTA',
        anexos: [oversizedInlineAttachment],
      }),
    ).rejects.toThrow(
      'Anexo inline excede o limite de 1.00MB para criação ou edição.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia criação com referência governada forjada no payload', async () => {
    const forgedReference = `gst:nc-attachment:${Buffer.from(
      JSON.stringify({
        v: 1,
        kind: 'governed-storage',
        fileKey: 'documents/company-1/nonconformity-attachments/nc-1/foto.png',
        originalName: 'foto.png',
        mimeType: 'image/png',
        uploadedAt: new Date().toISOString(),
      }),
    ).toString('base64url')}`;

    await expect(
      service.create({
        codigo_nc: 'NC-001',
        tipo: 'Operacional',
        data_identificacao: '2026-03-10',
        local_setor_area: 'Área 1',
        atividade_envolvida: 'Inspeção',
        responsavel_area: 'Maria',
        auditor_responsavel: 'João',
        descricao: 'Descrição',
        evidencia_observada: 'Evidência',
        condicao_insegura: 'Condição',
        requisito_nr: 'NR-1',
        requisito_item: '1.1',
        risco_perigo: 'Perigo',
        risco_associado: 'Risco',
        risco_nivel: 'Alto',
        status: 'ABERTA',
        anexos: [forgedReference],
      }),
    ).rejects.toThrow(
      'Anexos governados devem ser enviados pelo endpoint dedicado do módulo.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia criação quando já existe código NC ativo na empresa', async () => {
    repository.findOne.mockResolvedValueOnce({ id: 'nc-existing' });

    await expect(
      service.create({
        codigo_nc: 'nc-001',
        tipo: 'Operacional',
        data_identificacao: '2026-03-10',
        local_setor_area: 'Área 1',
        atividade_envolvida: 'Inspeção',
        responsavel_area: 'Maria',
        auditor_responsavel: 'João',
        descricao: 'Descrição',
        evidencia_observada: 'Evidência',
        condicao_insegura: 'Condição',
        requisito_nr: 'NR-1',
        requisito_item: '1.1',
        risco_perigo: 'Perigo',
        risco_associado: 'Risco',
        risco_nivel: 'Alto',
        status: 'ABERTA',
      }),
    ).rejects.toThrow(
      'Já existe uma não conformidade com este código na empresa atual.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia atualização quando o novo código NC já está em uso na empresa', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      codigo_nc: 'NC-001',
      anexos: [],
      pdf_file_key: null,
    } as unknown as NonConformity);
    repository.findOne.mockResolvedValueOnce({ id: 'nc-2' });

    await expect(
      service.update('nc-1', { codigo_nc: 'nc-002' }),
    ).rejects.toThrow(
      'Já existe uma não conformidade com este código na empresa atual.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('attachAttachment: salva evidência governada no storage oficial', async () => {
    const nc = {
      id: 'nc-1',
      company_id: 'company-1',
      anexos: ['https://evidencias.example.com/foto-antiga.jpg'],
      pdf_file_key: null,
    } as unknown as NonConformity;
    jest.spyOn(service, 'findOne').mockResolvedValue(nc);

    const result = await service.attachAttachment(
      'nc-1',
      Buffer.from('image-content'),
      'foto.png',
      'image/png',
    );

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('nonconformity-attachments'),
      Buffer.from('image-content'),
      'image/png',
    );
    const saveCalls = repository.save.mock.calls as Array<
      [Partial<NonConformity>]
    >;
    const savedPayload = saveCalls[0]?.[0];
    expect(savedPayload?.anexos).toEqual(
      expect.arrayContaining([
        'https://evidencias.example.com/foto-antiga.jpg',
        expect.stringContaining('gst:nc-attachment:'),
      ]),
    );
    expect(result.storageMode).toBe('governed-storage');
    expect(result.degraded).toBe(false);
    expect(result.attachment.originalName).toBe('foto.png');
  });

  it('getAttachmentAccess: sinaliza modo degradado quando a URL segura do anexo falha', async () => {
    const governedReference = `gst:nc-attachment:${Buffer.from(
      JSON.stringify({
        v: 1,
        kind: 'governed-storage',
        fileKey: 'documents/company-1/nonconformity-attachments/nc-1/foto.png',
        originalName: 'foto.png',
        mimeType: 'image/png',
        uploadedAt: new Date().toISOString(),
      }),
    ).toString('base64url')}`;
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'nc-1',
      company_id: 'company-1',
      anexos: [governedReference],
    } as unknown as NonConformity);
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValueOnce(
      new Error('storage offline'),
    );

    await expect(service.getAttachmentAccess('nc-1', 0)).resolves.toEqual({
      entityId: 'nc-1',
      index: 0,
      hasGovernedAttachment: true,
      availability: 'registered_without_signed_url',
      fileKey: 'documents/company-1/nonconformity-attachments/nc-1/foto.png',
      originalName: 'foto.png',
      mimeType: 'image/png',
      url: null,
      degraded: true,
      message:
        'Anexo governado registrado, mas a URL segura do storage não está disponível no momento.',
    });
  });

  it('getAnalyticsOverview: retorna contagem consolidada por status', async () => {
    jest.spyOn(service, 'summarizeByStatus').mockResolvedValue({
      total: 9,
      filtered: 9,
      byStatus: {
        ABERTA: 3,
        EM_ANDAMENTO: 2,
        AGUARDANDO_VALIDACAO: 1,
        ENCERRADA: 3,
      },
      filterStatus: null,
    });

    await expect(service.getAnalyticsOverview()).resolves.toEqual({
      totalNonConformities: 9,
      abertas: 3,
      emAndamento: 2,
      aguardandoValidacao: 1,
      encerradas: 3,
    });
  });
});
