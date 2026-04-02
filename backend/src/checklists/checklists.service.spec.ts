import { BadRequestException } from '@nestjs/common';
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
import type { DocumentRegistryService } from '../document-registry/document-registry.service';
import type { FileParserService } from '../document-import/services/file-parser.service';
import type { ConfigService } from '@nestjs/config';
import type { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import type { OpenAiCircuitBreakerService } from '../common/resilience/openai-circuit-breaker.service';

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
    find: jest.Mock;
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
  let documentRegistryService: Pick<
    DocumentRegistryService,
    'validatePublicCode' | 'validateLegacyPublicCode'
  >;
  let notificationsGateway: Pick<NotificationsGateway, 'sendToCompany'>;
  let signaturesService: Pick<
    SignaturesService,
    'findByDocument' | 'removeByDocumentSystem'
  >;
  let usersService: Pick<UsersService, 'findOne'>;
  let sitesService: Pick<SitesService, 'findOne'>;

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
      find: jest.fn(),
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
    documentRegistryService = {
      validatePublicCode: jest.fn(),
      validateLegacyPublicCode: jest.fn(),
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
      removeByDocumentSystem: jest.fn(() => Promise.resolve(0)),
    };
    usersService = {
      findOne: jest.fn((id: string) =>
        Promise.resolve({
          id,
          company_id: 'company-1',
        }),
      ),
    };
    sitesService = {
      findOne: jest.fn((id: string) =>
        Promise.resolve({
          id,
          company_id: 'company-1',
        }),
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
      usersService as unknown as UsersService,
      sitesService as unknown as SitesService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
      {} as FileParserService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      {
        execute: jest.fn(async <T>(_name: string, fn: () => Promise<T>) =>
          fn(),
        ),
      } as unknown as IntegrationResilienceService,
      {
        assertRequestAllowed: jest.fn(),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        isCountableFailureStatus: jest.fn().mockReturnValue(false),
        isCountableFailureError: jest.fn().mockReturnValue(false),
      } as unknown as OpenAiCircuitBreakerService,
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

  it('valida obra e inspetor no create do checklist operacional', async () => {
    await service.create({
      titulo: 'Checklist operacional',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      itens: [{ item: 'Inspecionar trava', status: 'ok' }],
      is_modelo: false,
    } as CreateChecklistDto);

    expect(sitesService.findOne).toHaveBeenCalledWith('site-1');
    expect(usersService.findOne).toHaveBeenCalledWith('user-1');
  });

  it('recalcula status final a partir dos itens no create', async () => {
    const result = await service.create({
      titulo: 'Checklist operacional',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      itens: [
        { item: 'Inspecionar trava', status: 'ok' },
        { item: 'Verificar bloqueio', status: 'nok', observacao: 'Falha' },
      ],
      status: 'Conforme',
      is_modelo: false,
    } as CreateChecklistDto);

    expect(result.status).toBe('Não Conforme');
  });

  it('recalcula status final a partir dos subitens quando o item possui alternativas respondidas', async () => {
    const result = await service.create({
      titulo: 'Checklist com subitens',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      itens: [
        {
          item: 'A cozinha atende aos requisitos?',
          status: 'sim',
          tipo_resposta: 'sim_nao_na',
          subitens: [
            { texto: 'Cobertura adequada', status: 'sim' },
            { texto: 'Ventilação adequada', status: 'nao' },
          ],
        },
      ],
      status: 'Conforme',
      is_modelo: false,
    } as CreateChecklistDto);

    expect(result.status).toBe('Não Conforme');
  });

  it('aceita topicos aninhados e preserva a hierarquia na resposta', async () => {
    const result = await service.create({
      titulo: 'Checklist hierarquico',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      topicos: [
        {
          titulo: 'VERIFICACAO DA AREA DE VIVENCIA',
          itens: [
            {
              item: 'A area possui condicoes adequadas?',
              subitens: [
                { texto: 'Cobertura adequada' },
                { texto: 'Ventilacao adequada' },
                { texto: 'Iluminacao adequada' },
              ],
            },
          ],
        },
      ],
    } as unknown as CreateChecklistDto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itens: expect.arrayContaining([
          expect.objectContaining({
            topico_titulo: 'VERIFICACAO DA AREA DE VIVENCIA',
            topico_id: expect.any(String),
            ordem_topico: 1,
            ordem_item: 1,
            subitens: expect.arrayContaining([
              expect.objectContaining({ ordem: 1, texto: 'Cobertura adequada' }),
              expect.objectContaining({ ordem: 2, texto: 'Ventilacao adequada' }),
              expect.objectContaining({ ordem: 3, texto: 'Iluminacao adequada' }),
            ]),
          }),
        ]),
      }),
    );

    const topicos = (result as unknown as { topicos?: Array<{ titulo: string; itens: Array<{ item: string; subitens?: Array<{ ordem?: number; texto: string }> }> }> }).topicos;
    expect(topicos).toHaveLength(1);
    expect(topicos?.[0].titulo).toBe('VERIFICACAO DA AREA DE VIVENCIA');
    expect(topicos?.[0].itens[0].subitens?.[0].texto).toBe('Cobertura adequada');
    expect(topicos?.[0].itens[0].subitens?.[1].ordem).toBe(2);
  });

  it('aceita payload do frontend com topicos separados de itens e recompõe a hierarquia', async () => {
    const result = await service.create({
      titulo: 'Checklist frontend',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      topicos: [
        { id: 'topic-1', titulo: 'AREA DE VIVENCIA', ordem: 1 },
        { id: 'topic-2', titulo: 'INSTALACOES ELETRICAS', ordem: 2 },
      ],
      itens: [
        {
          id: 'item-1',
          item: 'A area esta coberta?',
          topico_id: 'topic-1',
          topico_titulo: 'AREA DE VIVENCIA',
          ordem_topico: 1,
          ordem_item: 1,
          tipo_resposta: 'sim_nao_na',
          subitens: [{ texto: 'Cobertura adequada' }],
        },
        {
          id: 'item-2',
          item: 'Quadro eletrico identificado?',
          topico_id: 'topic-2',
          topico_titulo: 'INSTALACOES ELETRICAS',
          ordem_topico: 2,
          ordem_item: 1,
          tipo_resposta: 'sim_nao_na',
          subitens: [{ texto: 'Plaqueta visível' }],
        },
      ],
    } as unknown as CreateChecklistDto);

    const topicos = (
      result as unknown as {
        topicos?: Array<{
          titulo: string;
          itens: Array<{ item: string; subitens?: Array<{ texto: string }> }>;
        }>;
      }
    ).topicos;

    expect(topicos).toHaveLength(2);
    expect(topicos?.[0].titulo).toBe('AREA DE VIVENCIA');
    expect(topicos?.[0].itens[0].item).toBe('A area esta coberta?');
    expect(topicos?.[1].titulo).toBe('INSTALACOES ELETRICAS');
    expect(topicos?.[1].itens[0].subitens?.[0].texto).toBe(
      'Plaqueta visível',
    );
  });

  it('preserva metadados de Barreira Viva e calcula status da barreira no retorno', async () => {
    const result = await service.create({
      titulo: 'Checklist Barreira Viva',
      data: '2026-03-14',
      company_id: 'company-1',
      site_id: 'site-1',
      inspetor_id: 'user-1',
      topicos: [
        {
          id: 'topic-1',
          titulo: 'Barreira Física',
          descricao: 'Isolamento e contenção da área',
          ordem: 1,
          barreira_tipo: 'fisica',
          peso_barreira: 4,
          limite_ruptura: 1,
        },
      ],
      itens: [
        {
          id: 'item-1',
          item: 'Isolamento sinalizado',
          topico_id: 'topic-1',
          status: 'nao',
          tipo_resposta: 'sim_nao_na',
          criticidade: 'critico',
          bloqueia_operacao_quando_nc: true,
          exige_foto_quando_nc: true,
          exige_observacao_quando_nc: true,
          acao_corretiva_imediata: 'Interditar frente de serviço',
        },
      ],
    } as unknown as CreateChecklistDto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itens: expect.arrayContaining([
          expect.objectContaining({
            topico_descricao: 'Isolamento e contenção da área',
            barreira_tipo: 'fisica',
            peso_barreira: 4,
            limite_ruptura: 1,
            criticidade: 'critico',
            bloqueia_operacao_quando_nc: true,
            exige_foto_quando_nc: true,
            exige_observacao_quando_nc: true,
            acao_corretiva_imediata: 'Interditar frente de serviço',
          }),
        ]),
      }),
    );

    const topicos = (
      result as unknown as {
        topicos?: Array<{
          titulo: string;
          descricao?: string;
          barreira_tipo?: string;
          status_barreira?: string;
          controles_rompidos?: number;
          bloqueia_operacao?: boolean;
        }>;
      }
    ).topicos;

    expect(topicos?.[0]).toMatchObject({
      titulo: 'Barreira Física',
      descricao: 'Isolamento e contenção da área',
      barreira_tipo: 'fisica',
      status_barreira: 'rompida',
      controles_rompidos: 1,
      bloqueia_operacao: true,
    });
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

  it('invalida assinaturas quando o checklist sofre alteracao material', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist base',
      descricao: 'Descricao',
      equipamento: 'Detector',
      maquina: null,
      foto_equipamento: null,
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      itens: [{ item: 'Verificar trava', status: 'ok', fotos: [] }],
      is_modelo: false,
      pdf_file_key: null,
      categoria: 'SST',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Médio',
      auditado_por_id: null,
      data_auditoria: null,
      resultado_auditoria: null,
      notas_auditoria: null,
    } as unknown as Checklist);

    await service.update('checklist-1', {
      descricao: 'Descricao atualizada',
    });

    expect(signaturesService.removeByDocumentSystem).toHaveBeenCalledWith(
      'checklist-1',
      'CHECKLIST',
    );
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

  it('inclui os modelos padrão NR24, PEMT, furadeira/parafusadeira e talabarte no bootstrap com a estrutura esperada', async () => {
    repository.find.mockResolvedValue([]);
    repository.save.mockImplementation(async (payload: Partial<Checklist>[]) =>
      payload.map((item, index) => ({
        id: `template-${index + 1}`,
        created_at: new Date('2026-03-14T12:00:00.000Z'),
        updated_at: new Date('2026-03-14T12:00:00.000Z'),
        ...item,
      })),
    );

    const result = await service.createPresetTemplates();

    expect(result.created).toBe(10);
    expect(result.skipped).toBe(0);

    const nr24Template = (repository.save.mock.calls[0]?.[0] as Array<Checklist>)
      .find((item) => item.titulo === 'Checklist Operacional - NR24');
    const pemtTemplate = (repository.save.mock.calls[0]?.[0] as Array<Checklist>)
      .find(
        (item) => item.titulo === 'Checklist - Plataforma Elevatória Elétrica (PEMT)',
      );
    const portableDrillTemplate = (
      repository.save.mock.calls[0]?.[0] as Array<Checklist>
    ).find(
      (item) => item.titulo === 'Checklist - Furadeira/Parafusadeira Portátil',
    );
    const safetyLanyardTemplate = (
      repository.save.mock.calls[0]?.[0] as Array<Checklist>
    ).find((item) => item.titulo === 'Checklist - Talabarte de Segurança');

    expect(nr24Template).toBeDefined();
    expect(nr24Template).toMatchObject({
      descricao:
        'Modelo padrão do sistema para verificação de condições de vivência e higiene ocupacional conforme NR24.',
      categoria: 'Operacional',
      periodicidade: 'Conforme rotina',
      nivel_risco_padrao: 'Médio',
      is_modelo: true,
      ativo: true,
      company_id: 'company-1',
    });
    expect(nr24Template?.equipamento).toBeUndefined();
    expect(nr24Template?.maquina).toBeUndefined();
    expect(nr24Template?.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topico_titulo: 'Aplicação e dimensionamento',
          item:
            'O dimensionamento das instalações considera o número de trabalhadores usuários do turno de maior contingente?',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        }),
        expect.objectContaining({
          topico_titulo:
            'Anexo III – transporte público rodoviário coletivo urbano em atividade externa',
          item: 'O uso das instalações sanitárias é gratuito para os trabalhadores?',
        }),
      ]),
    );
    expect(pemtTemplate).toBeDefined();
    expect(pemtTemplate).toMatchObject({
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, operação segura, manutenção e bloqueio de plataforma elevatória elétrica.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Plataforma Elevatória Elétrica (PEMT)',
      is_modelo: true,
      ativo: true,
      company_id: 'company-1',
    });
    expect(pemtTemplate?.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topico_titulo: 'Documentação e Liberação',
          item: 'Manual - Manual do fabricante disponível para consulta',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
          criticidade: 'alto',
        }),
        expect.objectContaining({
          topico_titulo: 'Comandos e Testes Funcionais',
          item: 'Emergência - Botão de parada de emergência funcionando',
          criticidade: 'critico',
          bloqueia_operacao_quando_nc: true,
        }),
      ]),
    );
    expect(portableDrillTemplate).toBeDefined();
    expect(portableDrillTemplate).toMatchObject({
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, controle de risco elétrico, manutenção, bloqueio e pós-uso de furadeira/parafusadeira portátil.',
      categoria: 'Equipamento',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Furadeira/Parafusadeira Portátil',
      is_modelo: true,
      ativo: true,
      company_id: 'company-1',
    });
    expect(portableDrillTemplate?.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topico_titulo: 'Identificação e Documentação',
          item:
            'Identificação da ferramenta - Ferramenta identificada por código, patrimônio, número de série ou controle interno',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
          criticidade: 'alto',
        }),
        expect.objectContaining({
          topico_titulo: 'Segurança Elétrica',
          item: 'Tomada - Ponto de alimentação em condição segura',
          criticidade: 'critico',
          bloqueia_operacao_quando_nc: true,
        }),
      ]),
    );
    expect(safetyLanyardTemplate).toBeDefined();
    expect(safetyLanyardTemplate).toMatchObject({
      descricao:
        'Modelo padrão do sistema para inspeção pré-uso, liberação, uso seguro, compatibilidade, conservação, higienização, bloqueio e descarte de talabarte de segurança.',
      categoria: 'EPI',
      periodicidade: 'Pré-uso diário',
      nivel_risco_padrao: 'Alto',
      equipamento: 'Talabarte de Segurança',
      is_modelo: true,
      ativo: true,
      company_id: 'company-1',
    });
    expect(safetyLanyardTemplate?.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topico_titulo: 'Identificação, CA e Documentação',
          item:
            'Identificação do EPI - Talabarte identificado por marca, modelo, lote, número de série ou código interno',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
          criticidade: 'critico',
          bloqueia_operacao_quando_nc: true,
        }),
        expect.objectContaining({
          topico_titulo: 'Condições da Atividade e Integração com o SPIQ',
          item: 'Resgate - Procedimento de emergência e resgate compatível com a atividade',
          criticidade: 'critico',
          bloqueia_operacao_quando_nc: true,
        }),
      ]),
    );

    for (const item of nr24Template?.itens ?? []) {
      expect(item.barreira_tipo).toBeUndefined();
      expect(item.peso_barreira).toBeUndefined();
      expect(item.limite_ruptura).toBeUndefined();
      expect(item.criticidade).toBeUndefined();
      expect(item.bloqueia_operacao_quando_nc).toBeUndefined();
      expect(item.exige_foto_quando_nc).toBeUndefined();
      expect(item.exige_observacao_quando_nc).toBeUndefined();
      expect(item.acao_corretiva_imediata).toBeUndefined();
    }

    for (const item of pemtTemplate?.itens ?? []) {
      expect(item.barreira_tipo).toBeUndefined();
      expect(item.peso_barreira).toBeUndefined();
      expect(item.limite_ruptura).toBeUndefined();
    }

    for (const item of portableDrillTemplate?.itens ?? []) {
      expect(item.barreira_tipo).toBeUndefined();
      expect(item.peso_barreira).toBeUndefined();
      expect(item.limite_ruptura).toBeUndefined();
    }

    for (const item of safetyLanyardTemplate?.itens ?? []) {
      expect(item.barreira_tipo).toBeUndefined();
      expect(item.peso_barreira).toBeUndefined();
      expect(item.limite_ruptura).toBeUndefined();
    }
  });

  it('não duplica os modelos padrão NR24, PEMT, furadeira/parafusadeira e talabarte quando o bootstrap é executado novamente', async () => {
    repository.find.mockResolvedValue([
      { titulo: 'Checklist Operacional - NR24' },
      { titulo: 'Checklist - Plataforma Elevatória Elétrica (PEMT)' },
      { titulo: 'Checklist - Furadeira/Parafusadeira Portátil' },
      { titulo: 'Checklist - Talabarte de Segurança' },
      { titulo: 'Checklist - Trabalho em Altura' },
      { titulo: 'Checklist - Eletricidade' },
      { titulo: 'Checklist - Escavação' },
      { titulo: 'Checklist - Içamento de Carga' },
      { titulo: 'Checklist - Espaço Confinado' },
      { titulo: 'Checklist - Máquinas e Equipamentos' },
    ]);

    const result = await service.createPresetTemplates();

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      created: 0,
      skipped: 10,
      templates: [
        { titulo: 'Checklist Operacional - NR24' },
        { titulo: 'Checklist - Plataforma Elevatória Elétrica (PEMT)' },
        { titulo: 'Checklist - Furadeira/Parafusadeira Portátil' },
        { titulo: 'Checklist - Talabarte de Segurança' },
        { titulo: 'Checklist - Trabalho em Altura' },
        { titulo: 'Checklist - Eletricidade' },
        { titulo: 'Checklist - Escavação' },
        { titulo: 'Checklist - Içamento de Carga' },
        { titulo: 'Checklist - Espaço Confinado' },
        { titulo: 'Checklist - Máquinas e Equipamentos' },
      ],
    });
  });

  it('valida codigo publico apenas quando o checklist existe no registry governado', async () => {
    (
      documentRegistryService.validatePublicCode as jest.Mock
    ).mockResolvedValueOnce({
      valid: true,
      code: 'CHK-2025-EF123456',
      document: {
        id: '12345678-1234-1234-1234-abcdef123456',
        module: 'checklist',
      },
    });
    repository.findOne.mockResolvedValueOnce({
      id: '12345678-1234-1234-1234-abcdef123456',
      titulo: 'Checklist 2025',
      status: 'Conforme',
      data: new Date('2025-12-30T00:00:00.000Z'),
      is_modelo: false,
      updated_at: new Date('2025-12-30T18:00:00.000Z'),
      site: { nome: 'Obra A' },
      inspetor: { nome: 'Maria' },
    });

    (
      documentRegistryService.validatePublicCode as jest.Mock
    ).mockResolvedValueOnce({
      valid: false,
      code: 'CHK-2026-EF123456',
      message: 'Documento não encontrado.',
    });

    const valid = await service.validateByCode(
      'CHK-2025-EF123456',
      'tenant-1',
    );
    const invalid = await service.validateByCode(
      'CHK-2026-EF123456',
      'tenant-1',
    );

    expect(valid.valid).toBe(true);
    expect(valid.code).toBe('CHK-2025-EF123456');
    expect(invalid.valid).toBe(false);
    expect(documentRegistryService.validatePublicCode).toHaveBeenNthCalledWith(
      1,
      {
        code: 'CHK-2025-EF123456',
        companyId: 'tenant-1',
        expectedModule: 'checklist',
      },
    );
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

  it('valida contrato legado sem expor metadados', async () => {
    (documentRegistryService.validateLegacyPublicCode as jest.Mock).mockResolvedValue(
      {
        valid: true,
        code: 'CHK-2026-EF123456',
      },
    );

    const result = await service.validateByCodeLegacy('CHK-2026-EF123456');
    expect(result).toEqual({
      valid: true,
      code: 'CHK-2026-EF123456',
    });
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
      hasFinalPdf: true,
      availability: 'ready',
      message: 'PDF final do checklist disponível para acesso.',
    });
  });

  it('reaproveita PDF armazenado ao enviar email', async () => {
    const sendStoredDocument = jest.fn().mockResolvedValue({
      success: true,
      message:
        'O documento final governado foi enviado por e-mail com sucesso.',
      deliveryMode: 'sent',
      artifactType: 'governed_final_pdf',
      isOfficial: true,
      fallbackUsed: false,
    });
    service = new ChecklistsService(
      repository as unknown as Repository<Checklist>,
      { getTenantId: jest.fn(() => 'company-1') } as TenantService,
      {} as DataSource,
      { sendStoredDocument } as unknown as MailService,
      signaturesService as unknown as SignaturesService,
      notificationsGateway as NotificationsGateway,
      documentStorageService as DocumentStorageService,
      usersService as unknown as UsersService,
      sitesService as unknown as SitesService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
      {} as FileParserService,
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      {
        execute: jest.fn(async <T>(_name: string, fn: () => Promise<T>) =>
          fn(),
        ),
      } as unknown as IntegrationResilienceService,
      {
        assertRequestAllowed: jest.fn(),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
        isCountableFailureStatus: jest.fn().mockReturnValue(false),
        isCountableFailureError: jest.fn().mockReturnValue(false),
      } as unknown as OpenAiCircuitBreakerService,
    );

    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      titulo: 'Checklist de campo',
      company_id: 'company-1',
      data: new Date('2026-03-14T12:00:00.000Z'),
      pdf_file_key: 'documents/company-1/checklists/checklist-1.pdf',
      pdf_folder_path: 'documents/company-1/checklists',
      pdf_original_name: 'checklist-1.pdf',
    } as Checklist);
    jest.spyOn(service, 'getPdfAccess').mockResolvedValue({
      entityId: 'checklist-1',
      fileKey: 'documents/company-1/checklists/checklist-1.pdf',
      folderPath: 'documents/company-1/checklists',
      originalName: 'checklist-1.pdf',
      url: 'https://example.com/checklist.pdf',
      hasFinalPdf: true,
      availability: 'ready',
      message: 'PDF final do checklist disponível para acesso.',
    });

    const result = await service.sendEmail(
      'checklist-1',
      'cliente@empresa.com',
    );

    expect(sendStoredDocument).toHaveBeenCalledWith(
      'checklist-1',
      'CHECKLIST',
      'cliente@empresa.com',
      'company-1',
    );
    expect(result).toMatchObject({
      artifactType: 'governed_final_pdf',
      isOfficial: true,
      fallbackUsed: false,
    });
  });

  it('bloqueia envio de email quando o checklist ainda nao tem PDF final', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      titulo: 'Checklist de campo',
      company_id: 'company-1',
      data: new Date('2026-03-14T12:00:00.000Z'),
      pdf_file_key: null,
    } as Checklist);
    jest.spyOn(service, 'getPdfAccess').mockResolvedValue({
      entityId: 'checklist-1',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'O checklist ainda não possui PDF final emitido.',
    });

    await expect(
      service.sendEmail('checklist-1', 'cliente@empresa.com'),
    ).rejects.toThrow(
      'Emita o PDF final governado antes de enviar este checklist por e-mail.',
    );
  });

  it('anexa foto governada ao item do checklist', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      company_id: 'company-1',
      titulo: 'Checklist base',
      descricao: 'Descricao',
      equipamento: 'Detector',
      maquina: null,
      foto_equipamento: null,
      data: new Date('2026-03-14T12:00:00.000Z'),
      site_id: 'site-1',
      inspetor_id: 'user-1',
      itens: [{ item: 'Verificar trava', status: 'ok', fotos: [] }],
      is_modelo: false,
      pdf_file_key: null,
    } as unknown as Checklist);
    (
      signaturesService.removeByDocumentSystem as jest.Mock
    ).mockResolvedValueOnce(1);

    const result = await service.attachItemPhoto(
      'checklist-1',
      0,
      Buffer.from('png'),
      'foto.png',
      'image/png',
    );

    expect(result.scope).toBe('item');
    expect(result.storageMode).toBe('governed-storage');
    expect(result.photoReference).toContain('gst:checklist-photo:');
    expect(signaturesService.removeByDocumentSystem).toHaveBeenCalledWith(
      'checklist-1',
      'CHECKLIST',
    );
  });

  it('retorna estado explicito quando checklist ainda não tem PDF salvo', async () => {
    jest.spyOn(service, 'findOneEntity').mockResolvedValue({
      id: 'checklist-1',
      pdf_file_key: null,
      company_id: 'company-1',
    } as unknown as Checklist);

    await expect(service.getPdfAccess('checklist-1')).resolves.toEqual({
      entityId: 'checklist-1',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'O checklist ainda não possui PDF final emitido.',
    });
  });
});
