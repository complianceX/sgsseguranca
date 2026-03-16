import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ChecklistsService } from './checklists.service';
import { Checklist } from './entities/checklist.entity';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import type { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';
import type { SignaturesService } from '../signatures/signatures.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { UsersService } from '../users/users.service';
import type { SitesService } from '../sites/sites.service';
import type { NotificationsGateway } from '../notifications/notifications.gateway';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { FileParserService } from '../document-import/services/file-parser.service';
import type { ConfigService } from '@nestjs/config';

type RegisterFinalDocumentInput = Parameters<
  DocumentGovernanceService['registerFinalDocument']
>[0];
type RemoveFinalDocumentReferenceInput = Parameters<
  DocumentGovernanceService['removeFinalDocumentReference']
>[0];

describe('ChecklistsService', () => {
  let service: ChecklistsService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
  };
  let documentStorageService: Pick<
    DocumentStorageService,
    | 'uploadFile'
    | 'generateDocumentKey'
    | 'getPresignedDownloadUrl'
    | 'getSignedUrl'
    | 'deleteFile'
    | 'downloadFileBuffer'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    | 'registerFinalDocument'
    | 'removeFinalDocumentReference'
    | 'listFinalDocuments'
    | 'getModuleWeeklyBundle'
  >;
  let notificationsGateway: Pick<NotificationsGateway, 'sendToCompany'>;
  let signaturesService: Pick<SignaturesService, 'findByDocument'>;

  beforeEach(() => {
    repository = {
      create: jest.fn((payload: Partial<Checklist>) => payload),
      save: jest.fn((payload: Partial<Checklist>) =>
        Promise.resolve({
          id: payload.id || 'checklist-1',
          created_at:
            payload.created_at || new Date('2026-03-14T12:00:00.000Z'),
          updated_at: new Date('2026-03-14T12:00:00.000Z'),
          ...payload,
        }),
      ),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
    };
    documentStorageService = {
      uploadFile: jest.fn(),
      generateDocumentKey: jest.fn(
        (
          companyId: string,
          documentType: string,
          documentId: string,
          originalName: string,
        ) =>
          `documents/${companyId}/${documentType}/${documentId}/${originalName}`,
      ),
      getPresignedDownloadUrl: jest.fn(() =>
        Promise.resolve('https://example.com/checklist.pdf'),
      ),
      getSignedUrl: jest.fn(() =>
        Promise.resolve('https://example.com/checklist.pdf'),
      ),
      deleteFile: jest.fn(() => Promise.resolve()),
      downloadFileBuffer: jest.fn(() =>
        Promise.resolve(Buffer.from('%PDF-checklist-stored')),
      ),
    };
    documentGovernanceService = {
      registerFinalDocument: jest.fn(),
      removeFinalDocumentReference: jest.fn(),
      listFinalDocuments: jest.fn(),
      getModuleWeeklyBundle: jest.fn(),
    };
    notificationsGateway = {
      sendToCompany: jest.fn(),
    };
    signaturesService = {
      findByDocument: jest.fn(() =>
        Promise.resolve([
          {
            id: 'signature-1',
            user_id: 'user-1',
            signature_data: 'data:image/png;base64,AAAA',
            created_at: '2026-03-14T12:00:00.000Z',
            user: { nome: 'Maria' },
          },
        ]),
      ),
    };

    service = new ChecklistsService(
      repository as unknown as Repository<Checklist>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as DataSource,
      { sendMailSimple: jest.fn() } as unknown as MailService,
      signaturesService as unknown as SignaturesService,
      notificationsGateway as NotificationsGateway,
      documentStorageService as DocumentStorageService,
      {} as UsersService,
      {} as SitesService,
      documentGovernanceService as DocumentGovernanceService,
      {} as FileParserService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('passa o checklist final pela esteira central e persiste metadados no callback transacional', async () => {
    const checklist = {
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist de campo',
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      is_modelo: false,
      pdf_file_key: null,
    } as Checklist;
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    jest.spyOn(service, 'findOneEntity').mockResolvedValue(checklist);
    jest
      .spyOn(service, 'generatePdf')
      .mockResolvedValue(Buffer.from('%PDF-checklist'));
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockImplementation(async (input: RegisterFinalDocumentInput) => {
      await input.persistEntityMetadata(manager);
      return { hash: 'hash-1', registryEntry: { id: 'registry-1' } };
    });

    const result = await service.savePdfToStorage('checklist-1');

    expect(result.fileKey).toEqual(
      expect.stringContaining('checklist-checklist-1.pdf'),
    );
    expect(result.folderPath).toEqual(
      expect.stringContaining('checklists/company-1/2026/week-'),
    );
    expect(result.fileUrl).toBe('https://example.com/checklist.pdf');

    expect(documentStorageService.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('checklist-checklist-1.pdf'),
      Buffer.from('%PDF-checklist'),
      'application/pdf',
    );
    expect(
      documentGovernanceService.registerFinalDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        module: 'checklist',
        entityId: 'checklist-1',
        fileBuffer: Buffer.from('%PDF-checklist'),
      }),
    );
    const [updateCriteria, updatePayload] = update.mock.calls[0] as [
      { id: string },
      { pdf_file_key: string; pdf_original_name: string },
    ];
    expect(updateCriteria).toEqual({ id: 'checklist-1' });
    expect(updatePayload.pdf_file_key).toContain('checklist-checklist-1.pdf');
    expect(updatePayload.pdf_original_name).toBe('checklist-checklist-1.pdf');
  });

  it('remove checklist via esteira central para limpar o registry no mesmo fluxo', async () => {
    const checklist = {
      id: 'checklist-1',
      company_id: 'company-1',
    } as Checklist;
    const softDelete = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ softDelete })),
    };
    jest.spyOn(service, 'findOneEntity').mockResolvedValue(checklist);
    (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mockImplementation(async (input: RemoveFinalDocumentReferenceInput) => {
      await input.removeEntityState(manager);
    });

    await expect(service.remove('checklist-1')).resolves.toBeUndefined();

    const [removeInput] = (
      documentGovernanceService.removeFinalDocumentReference as jest.Mock
    ).mock.calls[0] as [RemoveFinalDocumentReferenceInput];
    expect(removeInput.companyId).toBe('company-1');
    expect(removeInput.module).toBe('checklist');
    expect(removeInput.entityId).toBe('checklist-1');
    expect(typeof removeInput.removeEntityState).toBe('function');
    expect(softDelete).toHaveBeenCalledWith('checklist-1');
  });

  it('limpa o PDF do checklist no storage quando a governanca falha', async () => {
    const checklist = {
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist de campo',
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      is_modelo: false,
      pdf_file_key: null,
    } as Checklist;
    jest.spyOn(service, 'findOneEntity').mockResolvedValue(checklist);
    jest
      .spyOn(service, 'generatePdf')
      .mockResolvedValue(Buffer.from('%PDF-checklist'));
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failed'));

    await expect(service.savePdfToStorage('checklist-1')).rejects.toThrow(
      'governance failed',
    );

    expect(documentStorageService.deleteFile).toHaveBeenCalledWith(
      expect.stringContaining('checklist-checklist-1.pdf'),
    );
  });

  it('bloqueia emissao final quando o checklist ainda nao possui assinatura', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist sem assinatura',
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      is_modelo: false,
      pdf_file_key: null,
    } as Checklist);
    (signaturesService.findByDocument as jest.Mock).mockResolvedValueOnce([]);

    await expect(service.savePdfToStorage('checklist-1')).rejects.toThrow(
      'Checklist precisa de ao menos uma assinatura antes da emissão do PDF final.',
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('bloqueia emissao final de modelo de checklist', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'template-1',
      company_id: 'company-1',
      titulo: 'Modelo',
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: null,
      inspetor_id: null,
      is_modelo: true,
      pdf_file_key: null,
    } as unknown as Checklist);

    await expect(service.savePdfToStorage('template-1')).rejects.toThrow(
      'Modelos de checklist não podem ser emitidos como documento final.',
    );

    expect(documentStorageService.uploadFile).not.toHaveBeenCalled();
  });

  it('rejeita checklist operacional sem obra ou inspetor', async () => {
    await expect(
      service.create({
        titulo: 'Checklist operacional',
        data: '2026-03-14',
        company_id: 'company-1',
        itens: [],
        is_modelo: false,
      } as CreateChecklistDto),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('bloqueia edicao quando o checklist ja possui PDF final emitido', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist finalizado',
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      is_modelo: false,
      pdf_file_key: 'documents/company-1/checklists/checklist-1.pdf',
    } as Checklist);

    await expect(
      service.update('checklist-1', { titulo: 'Novo título' }),
    ).rejects.toThrow(
      'Checklist com PDF final emitido. Edição bloqueada. Gere um novo checklist para alterar o documento.',
    );

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('preenche checklist a partir do template por allowlist segura', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'template-1',
      titulo: 'Modelo',
      descricao: 'Template',
      equipamento: 'Detector',
      maquina: null,
      foto_equipamento: null,
      data: new Date('2026-03-10'),
      status: 'Pendente',
      company_id: 'company-1',
      site_id: null,
      inspetor_id: null,
      itens: [
        {
          id: 'item-1',
          item: 'Verificar trava',
          tipo_resposta: 'conforme',
          obrigatorio: true,
          peso: 1,
          status: 'nok',
          observacao: 'template',
          fotos: ['template-photo'],
        },
      ],
      is_modelo: true,
      ativo: true,
      categoria: 'SST',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Médio',
      pdf_file_key: 'documents/template.pdf',
      pdf_folder_path: 'documents/company-1/checklists',
      pdf_original_name: 'template.pdf',
      created_at: new Date('2026-03-01'),
      updated_at: new Date('2026-03-01'),
    } as unknown as Checklist);

    const result = await service.fillFromTemplate('template-1', {
      data: '2026-03-15',
      site_id: 'site-1',
      inspetor_id: 'user-1',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Modelo',
        company_id: 'company-1',
        template_id: 'template-1',
        site_id: 'site-1',
        inspetor_id: 'user-1',
        is_modelo: false,
      }),
    );
    expect(result.is_modelo).toBe(false);
    const firstItem = (result.itens as Array<Record<string, unknown>>)[0];
    expect(firstItem).toEqual(
      expect.objectContaining({
        item: 'Verificar trava',
        status: 'ok',
        observacao: '',
        fotos: [],
      }),
    );
  });

  it('usa a data do checklist para validar codigo publico', async () => {
    repository.createQueryBuilder.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: '12345678-1234-1234-1234-abcdef123456',
          titulo: 'Checklist 2025',
          status: 'Conforme',
          data: new Date('2025-12-30T00:00:00.000Z'),
          is_modelo: false,
          updated_at: new Date('2025-12-30T18:00:00.000Z'),
          site: { nome: 'Obra A' },
          inspetor: { nome: 'Maria' },
        },
      ]),
    });

    const valid = await service.validateByCode('CHK-2025-EF123456');
    const invalid = await service.validateByCode('CHK-2026-EF123456');

    expect(valid.valid).toBe(true);
    expect(valid.checklist?.titulo).toBe('Checklist 2025');
    expect(invalid.valid).toBe(false);
  });

  it('filtra arquivos semanais pela data documental e nao pela criacao', async () => {
    (
      documentGovernanceService.listFinalDocuments as jest.Mock
    ).mockResolvedValue([
      {
        entityId: 'checklist-1',
        title: 'Checklist datado',
        date: new Date('2025-12-31T00:00:00.000Z'),
        id: 'checklist-1',
        companyId: 'company-1',
        fileKey:
          'documents/company-1/checklists/2025/week-01/checklist-1/checklist-checklist-1.pdf',
        folderPath: 'checklists/company-1/2025/week-01',
        originalName: 'checklist-checklist-1.pdf',
      },
    ]);

    const files = await service.listStoredFiles({ year: 2025 });

    expect(files).toHaveLength(1);
    expect(files[0].entityId).toBe('checklist-1');
    expect(documentGovernanceService.listFinalDocuments).toHaveBeenCalledWith(
      'checklist',
      { year: 2025 },
    );
  });

  it('retorna acesso ao PDF salvo do checklist', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      pdf_file_key: 'documents/company-1/checklists/checklist-1.pdf',
      pdf_folder_path: 'documents/company-1/checklists',
      pdf_original_name: 'checklist-1.pdf',
    } as Checklist);

    await expect(service.getPdfAccess('checklist-1')).resolves.toEqual({
      entityId: 'checklist-1',
      fileKey: 'documents/company-1/checklists/checklist-1.pdf',
      folderPath: 'documents/company-1/checklists',
      originalName: 'checklist-1.pdf',
      url: 'https://example.com/checklist.pdf',
    });
  });

  it('reaproveita PDF armazenado ao enviar email', async () => {
    const sendMailSimple = jest.fn();
    service = new ChecklistsService(
      repository as unknown as Repository<Checklist>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as DataSource,
      { sendMailSimple } as unknown as MailService,
      signaturesService as unknown as SignaturesService,
      notificationsGateway as NotificationsGateway,
      documentStorageService as DocumentStorageService,
      {} as UsersService,
      {} as SitesService,
      documentGovernanceService as DocumentGovernanceService,
      {} as FileParserService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
    );

    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      titulo: 'Checklist de campo',
      company_id: 'company-1',
      data: new Date('2026-03-14T12:00:00.000Z'),
      pdf_file_key: 'documents/company-1/checklists/checklist-1.pdf',
    } as Checklist);
    const generatePdfSpy = jest.spyOn(service, 'generatePdf');

    await service.sendEmail('checklist-1', 'cliente@empresa.com');

    expect(documentStorageService.downloadFileBuffer).toHaveBeenCalledWith(
      'documents/company-1/checklists/checklist-1.pdf',
    );
    expect(generatePdfSpy).not.toHaveBeenCalled();
    expect(sendMailSimple).toHaveBeenCalled();
  });

  it('lança erro quando checklist não tem PDF salvo para acesso', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      pdf_file_key: null,
    } as unknown as Checklist);

    await expect(service.getPdfAccess('checklist-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
