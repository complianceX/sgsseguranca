import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RdosService } from './rdos.service';
import { Rdo } from './entities/rdo.entity';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import type { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import type { RdoAuditService } from './rdo-audit.service';

const COMPANY_ID = 'company-1';
const RDO_ID = '11111111-2222-3333-4444-555555555555';

function makeRdo(overrides: Partial<Rdo> = {}): Rdo {
  return {
    id: RDO_ID,
    numero: 'RDO-202603-001',
    data: new Date('2026-03-16'),
    status: 'rascunho',
    company_id: COMPANY_ID,
    houve_acidente: false,
    houve_paralisacao: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as Rdo;
}

const getFirstCreateArg = (
  createMock: jest.Mock,
): Partial<Rdo> & { company_id?: string } => {
  const firstCall = createMock.mock.calls[0] as [Partial<Rdo>] | undefined;

  if (!firstCall) {
    throw new Error('repository.create não foi chamado.');
  }

  return firstCall[0];
};

describe('RdosService', () => {
  let service: RdosService;
  let repository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: {
      getRepository: jest.Mock;
    };
  };
  let tenantService: Pick<TenantService, 'getTenantId'>;
  let mailService: Pick<MailService, 'sendMail' | 'sendMailSimple'>;
  let documentStorageService: Pick<
    DocumentStorageService,
    | 'uploadFile'
    | 'getSignedUrl'
    | 'downloadFileBuffer'
    | 'deleteFile'
    | 'generateDocumentKey'
  >;
  let documentGovernanceService: Pick<
    DocumentGovernanceService,
    | 'syncFinalDocumentMetadata'
    | 'registerFinalDocument'
    | 'listFinalDocuments'
    | 'getModuleWeeklyBundle'
    | 'removeFinalDocumentReference'
  >;
  let documentRegistryService: Pick<DocumentRegistryService, 'findByDocument'>;
  let rdoAuditService: Pick<
    RdoAuditService,
    | 'recordCancellation'
    | 'recordEvent'
    | 'getEventsForRdo'
    | 'recordStatusChange'
    | 'recordPdfGenerated'
    | 'recordSignature'
  >;
  let siteScopedRepository: { exist: jest.Mock };
  let userScopedRepository: { exist: jest.Mock };

  beforeEach(() => {
    const defaultQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
      getRawMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as Rdo)),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((input) => ({ ...input }) as Rdo),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(defaultQb),
      manager: {
        getRepository: jest.fn((entity) => {
          if (entity === Site) {
            return siteScopedRepository;
          }

          if (entity === User) {
            return userScopedRepository;
          }

          throw new Error(`Repository não mapeado no teste: ${String(entity)}`);
        }),
      },
    };
    siteScopedRepository = {
      exist: jest.fn().mockResolvedValue(true),
    };
    userScopedRepository = {
      exist: jest.fn().mockResolvedValue(true),
    };
    tenantService = { getTenantId: jest.fn(() => COMPANY_ID) };
    mailService = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      sendMailSimple: jest.fn().mockResolvedValue(undefined),
    };
    documentStorageService = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn().mockResolvedValue('https://storage.test/rdo.pdf'),
      downloadFileBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-rdo')),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      generateDocumentKey: jest
        .fn()
        .mockReturnValue(
          'documents/company-1/rdos/11111111-2222-3333-4444-555555555555/rdo.pdf',
        ),
    };
    documentGovernanceService = {
      syncFinalDocumentMetadata: jest
        .fn()
        .mockResolvedValue({ id: 'registry-1' }),
      registerFinalDocument: jest.fn().mockResolvedValue({
        hash: 'hash-rdo',
        registryEntry: { id: 'registry-1' },
      }),
      listFinalDocuments: jest.fn().mockResolvedValue([]),
      getModuleWeeklyBundle: jest.fn().mockResolvedValue({
        buffer: Buffer.from('%PDF-bundle'),
        fileName: 'rdo-bundle.pdf',
      }),
      removeFinalDocumentReference: jest.fn().mockResolvedValue(undefined),
    };
    documentRegistryService = {
      findByDocument: jest.fn().mockResolvedValue(null),
    };
    rdoAuditService = {
      recordCancellation: jest.fn().mockResolvedValue(undefined),
      recordEvent: jest.fn().mockResolvedValue(undefined),
      getEventsForRdo: jest.fn().mockResolvedValue([
        {
          id: 'event-1',
          event_type: 'SIGNED',
          user_id: 'user-1',
          created_at: new Date('2026-03-16T12:00:00Z'),
          details: { signatureType: 'responsavel' },
        },
      ]),
      recordStatusChange: jest.fn().mockResolvedValue(undefined),
      recordPdfGenerated: jest.fn().mockResolvedValue(undefined),
      recordSignature: jest.fn().mockResolvedValue(undefined),
    };

    service = new RdosService(
      repository as unknown as Repository<Rdo>,
      tenantService as TenantService,
      mailService as MailService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
      rdoAuditService as RdoAuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ──────────────────────────────────────────────────────────────────

  it('cria RDO com numero gerado automaticamente', async () => {
    repository.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 'RDO-202603-002' }),
    });
    const dto: CreateRdoDto = {
      company_id: COMPANY_ID,
      data: '2026-03-16',
      status: 'rascunho',
    };
    const result = await service.create(dto);
    expect(result.numero).toMatch(/^RDO-\d{6}-003$/);
    expect(repository.save).toHaveBeenCalled();
  });

  it('usa company_id do tenant quando o DTO nao fornece', async () => {
    repository.count.mockResolvedValue(0);
    const dto: CreateRdoDto = { data: '2026-03-16' };
    await service.create(dto);
    const createdArg = getFirstCreateArg(repository.create);
    expect(createdArg.company_id).toBe(COMPANY_ID);
  });

  it('ignora company_id divergente do payload quando o tenant atual existe', async () => {
    const dto: CreateRdoDto = {
      company_id: 'company-spoofed',
      data: '2026-03-16',
    };

    await service.create(dto);

    const createdArg = getFirstCreateArg(repository.create);
    expect(createdArg.company_id).toBe(COMPANY_ID);
  });

  it('rejeita create quando o site nao pertence a empresa atual', async () => {
    siteScopedRepository.exist.mockResolvedValue(false);

    await expect(
      service.create({
        data: '2026-03-16',
        site_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }),
    ).rejects.toThrow('Site inválido para a empresa/tenant atual.');
  });

  it('bloqueia create com status diferente de rascunho', async () => {
    await expect(
      service.create({
        data: '2026-03-16',
        status: 'aprovado',
      }),
    ).rejects.toThrow(
      'O status do RDO é controlado pelo fluxo formal de tramitação.',
    );
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  it('retorna RDO existente pelo ID', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    await expect(service.findOne(RDO_ID)).resolves.toEqual(rdo);
  });

  it('lanca NotFoundException quando RDO nao existe', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  it('atualiza campos do RDO', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    const dto: UpdateRdoDto = {
      observacoes: 'Atualizado',
    };
    const result = await service.update(RDO_ID, dto);
    expect(result.observacoes).toBe('Atualizado');
    expect(repository.save).toHaveBeenCalled();
  });

  it('rejeita update quando o responsavel nao pertence a empresa atual', async () => {
    const rdo = makeRdo({ responsavel_id: 'resp-atual' });
    repository.findOne.mockResolvedValue(rdo);
    userScopedRepository.exist.mockResolvedValue(false);

    await expect(
      service.update(RDO_ID, {
        responsavel_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      }),
    ).rejects.toThrow('Responsável inválido para a empresa/tenant atual.');
  });

  it('bloqueia troca de company_id pelo endpoint generico', async () => {
    repository.findOne.mockResolvedValue(makeRdo());

    await expect(
      service.update(RDO_ID, { company_id: 'company-2' }),
    ).rejects.toThrow(
      'O company_id do RDO não pode ser alterado pelo endpoint genérico.',
    );
  });

  // ─── updateStatus ────────────────────────────────────────────────────────────

  it('transiciona status de rascunho para enviado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'rascunho' }));
    const result = await service.updateStatus(RDO_ID, 'enviado');
    expect(result.status).toBe('enviado');
    expect(rdoAuditService.recordStatusChange).toHaveBeenCalledWith(
      RDO_ID,
      'rascunho',
      'enviado',
    );
  });

  it('transiciona status para cancelado através do cancelamento explícito', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'enviado' }));
    const result = await service.cancel(RDO_ID, 'Erro de preenchimento');
    expect(result.status).toBe('cancelado');
    expect(repository.save).toHaveBeenCalled();
    expect(rdoAuditService.recordCancellation).toHaveBeenCalledWith(
      RDO_ID,
      'Erro de preenchimento',
      'enviado',
    );
  });

  it('bloqueia cancelamento quando o RDO ja possui PDF final governado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'aprovado' }));
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-1',
      file_key: 'documents/rdo.pdf',
    });

    await expect(service.cancel(RDO_ID, 'Tentativa tardia')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('exige assinaturas antes de aprovar o RDO', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'enviado' }));
    await expect(service.updateStatus(RDO_ID, 'aprovado')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia transicao de status invalida', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'aprovado' }));
    await expect(service.updateStatus(RDO_ID, 'rascunho')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia transicao direta de rascunho para aprovado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'rascunho' }));
    await expect(service.updateStatus(RDO_ID, 'aprovado')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ─── getAuditTrail ──────────────────────────────────────────────────────────

  it('retorna a trilha de auditoria do RDO', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    const result = await service.getAuditTrail(RDO_ID);
    expect(result).toEqual([
      {
        id: 'event-1',
        eventType: 'SIGNED',
        eventLabel: 'Assinado',
        userId: 'user-1',
        createdAt: new Date('2026-03-16T12:00:00Z'),
        details: { signatureType: 'responsavel' },
      },
    ]);
    expect(rdoAuditService.getEventsForRdo).toHaveBeenCalledWith(RDO_ID);
  });

  // ─── sign ────────────────────────────────────────────────────────────────────

  it('registra assinatura do responsavel', async () => {
    const rdo = makeRdo({ status: 'enviado' });
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.sign(RDO_ID, {
      tipo: 'responsavel',
      nome: 'João Silva',
      cpf: '12345678900',
    });
    expect(result.assinatura_responsavel).toBeDefined();
    const parsed = JSON.parse(result.assinatura_responsavel!) as {
      nome: string;
      cpf: string;
      signed_at: string;
      signature_mode: string;
      document_hash: string;
    };
    expect(parsed.nome).toBe('João Silva');
    expect(parsed.cpf).toBe('12345678900');
    expect(parsed.signature_mode).toBe('operational_ack');
    expect(parsed.document_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.signed_at).toBeDefined();
    expect(rdoAuditService.recordSignature).toHaveBeenCalledWith(
      RDO_ID,
      'responsavel',
      'João Silva',
    );
  });

  it('registra assinatura do engenheiro', async () => {
    const rdo = makeRdo({ status: 'enviado' });
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.sign(RDO_ID, {
      tipo: 'engenheiro',
      nome: 'Ana Engenheira',
      cpf: '98765432100',
    });
    expect(result.assinatura_engenheiro).toBeDefined();
    const parsed = JSON.parse(result.assinatura_engenheiro!) as {
      nome: string;
      signature_mode: string;
    };
    expect(parsed.nome).toBe('Ana Engenheira');
    expect(parsed.signature_mode).toBe('operational_ack');
    expect(rdoAuditService.recordSignature).toHaveBeenCalledWith(
      RDO_ID,
      'engenheiro',
      'Ana Engenheira',
    );
  });

  it('bloqueia assinatura enquanto o RDO ainda esta em rascunho', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'rascunho' }));

    await expect(
      service.sign(RDO_ID, {
        tipo: 'responsavel',
        nome: 'João Silva',
        cpf: '12345678900',
      }),
    ).rejects.toThrow('Envie o RDO para revisão antes de coletar assinaturas.');
  });

  // ─── markPdfSaved ────────────────────────────────────────────────────────────

  it('despromove explicitamente o endpoint legado save-pdf', async () => {
    const rdo = makeRdo({
      status: 'aprovado',
      assinatura_responsavel: '{"nome":"Resp"}',
      assinatura_engenheiro: '{"nome":"Eng"}',
    });
    repository.findOne.mockResolvedValue(rdo);

    await expect(
      service.markPdfSaved(RDO_ID, {
        filename: 'rdo-2026.pdf',
      }),
    ).rejects.toThrow(
      'O endpoint legado POST /rdos/:id/save-pdf foi descontinuado.',
    );
    expect(rdoAuditService.recordEvent).toHaveBeenCalledWith(
      RDO_ID,
      'LEGACY_SAVE_PDF_ATTEMPT',
      expect.objectContaining({
        endpoint: 'POST /rdos/:id/save-pdf',
        deprecated: true,
      }),
    );
  });

  it('bloqueia alteracao quando o RDO ja possui PDF final governado', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-1',
    });
    const dto: UpdateRdoDto = { observacoes: 'Nao deveria editar' };

    await expect(service.update(RDO_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ─── getPdfAccess ────────────────────────────────────────────────────────────

  it('retorna contrato explícito quando o PDF final ainda não foi emitido', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue(
      null,
    );

    await expect(service.getPdfAccess(RDO_ID)).resolves.toEqual({
      entityId: RDO_ID,
      hasFinalPdf: false,
      availability: 'not_emitted',
      message: 'O PDF final do RDO ainda não foi emitido.',
      fileKey: null,
      folderPath: null,
      originalName: null,
      url: null,
    });
  });

  it('retorna disponibilidade degradada quando a URL assinada falha', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      file_key: 'documents/rdo.pdf',
      folder_path: 'rdos/company-1/2026/week-12',
      original_name: 'rdo.pdf',
    });
    (documentStorageService.getSignedUrl as jest.Mock).mockRejectedValue(
      new Error('signed-url unavailable'),
    );

    await expect(service.getPdfAccess(RDO_ID)).resolves.toEqual({
      entityId: RDO_ID,
      hasFinalPdf: true,
      availability: 'registered_without_signed_url',
      message:
        'O PDF final do RDO foi emitido, mas a URL segura não está disponível agora.',
      fileKey: 'documents/rdo.pdf',
      folderPath: 'rdos/company-1/2026/week-12',
      originalName: 'rdo.pdf',
      url: null,
    });
  });

  // ─── sendEmail ───────────────────────────────────────────────────────────────

  it('envia e-mail com dados do RDO para cada destinatario', async () => {
    const rdo = makeRdo({
      numero: 'RDO-202603-001',
      mao_de_obra: [
        { funcao: 'Pedreiro', quantidade: 3, turno: 'manha', horas: 8 },
      ],
      equipamentos: [
        {
          nome: 'Escavadeira',
          quantidade: 1,
          horas_trabalhadas: 4,
          horas_ociosas: 0,
        },
      ],
      servicos_executados: [
        { descricao: 'Escavação', percentual_concluido: 50 },
      ],
      ocorrencias: [],
    });
    repository.findOne.mockResolvedValue(rdo);

    await service.sendEmail(RDO_ID, ['gestor@empresa.com', 'eng@empresa.com']);

    expect(mailService.sendMail).toHaveBeenCalledTimes(2);
    const [to, subject, , html] = (mailService.sendMail as jest.Mock).mock
      .calls[0] as [string, string, string, string];
    expect(to).toBe('gestor@empresa.com');
    expect(subject).toContain('RDO-202603-001');
    expect(html).toContain('Relatório Diário de Obra');
  });

  it('nao envia e-mail quando lista de destinatarios esta vazia', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    await service.sendEmail(RDO_ID, []);
    expect(mailService.sendMail).not.toHaveBeenCalled();
  });

  it('envia PDF final governado em anexo quando o RDO ja foi emitido', async () => {
    repository.findOne.mockResolvedValue(
      makeRdo({ pdf_file_key: 'documents/rdo.pdf' }),
    );
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      file_key: 'documents/rdo.pdf',
      original_name: 'rdo.pdf',
    });

    await service.sendEmail(RDO_ID, ['gestor@empresa.com']);

    expect(documentStorageService.downloadFileBuffer).toHaveBeenCalledWith(
      'documents/rdo.pdf',
    );
    expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
  });

  // ─── listFiles ───────────────────────────────────────────────────────────────

  it('lista arquivos governados pelo document registry', async () => {
    (
      documentGovernanceService.listFinalDocuments as jest.Mock
    ).mockResolvedValue([
      {
        entityId: RDO_ID,
        id: RDO_ID,
        title: 'RDO-202603-001',
        date: new Date('2026-03-16'),
        companyId: COMPANY_ID,
        fileKey: 'documents/rdo.pdf',
        folderPath: 'rdos/company-1/2026/week-12',
        originalName: 'rdo.pdf',
        module: 'rdo',
      },
    ]);
    const result = await service.listFiles();
    expect(documentGovernanceService.listFinalDocuments).toHaveBeenCalledWith(
      'rdo',
      {},
    );
    expect(result).toHaveLength(1);
  });

  it('retorna overview analitico consolidado do tenant atual', async () => {
    repository.count.mockImplementation(({ where }) => {
      const status = (where as { status?: string } | undefined)?.status;

      if (!status) {
        return Promise.resolve(12);
      }
      if (status === 'rascunho') {
        return Promise.resolve(5);
      }
      if (status === 'enviado') {
        return Promise.resolve(4);
      }
      if (status === 'aprovado') {
        return Promise.resolve(3);
      }
      if (status === 'cancelado') {
        return Promise.resolve(2);
      }

      return Promise.resolve(0);
    });

    await expect(service.getAnalyticsOverview()).resolves.toEqual({
      totalRdos: 12,
      rascunho: 5,
      enviado: 4,
      aprovado: 3,
      cancelado: 2,
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  it('remove o RDO pelo ID', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    await expect(service.remove(RDO_ID)).resolves.toBeUndefined();
    expect(
      documentGovernanceService.removeFinalDocumentReference,
    ).toHaveBeenCalled();
    expect(repository.remove).toHaveBeenCalledWith(rdo);
  });

  it('bloqueia remocao fisica de RDO aprovado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'aprovado' }));
    await expect(service.remove(RDO_ID)).rejects.toThrow(
      'RDOs aprovados ou cancelados não podem ser excluídos fisicamente',
    );
  });

  it('lanca NotFoundException ao remover RDO inexistente', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.remove('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── generateNumero (via create) ─────────────────────────────────────────────

  it('gera numero sequencial por mes (nao por total da empresa)', async () => {
    repository.createQueryBuilder.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 'RDO-202603-005' }),
    });
    const dto: CreateRdoDto = {
      company_id: COMPANY_ID,
      data: '2026-03-16',
    };
    const result = await service.create(dto);
    expect(result.numero).toMatch(/^RDO-\d{6}-006$/);
  });

  it('inicia sequencia em 001 quando nao ha RDOs no mes', async () => {
    // default mock already returns { max: null } — no override needed
    const dto: CreateRdoDto = {
      company_id: COMPANY_ID,
      data: '2026-04-01',
    };
    const result = await service.create(dto);
    expect(result.numero).toMatch(/^RDO-\d{6}-001$/);
  });

  // ─── update (status bypass protection) ───────────────────────────────────────

  it('bloqueia alteracao de status pelo endpoint generico de update', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    const dto: UpdateRdoDto = { status: 'aprovado' };
    await expect(service.update(RDO_ID, dto)).rejects.toThrow(
      'Use PATCH /rdos/:id/status para alterar o status do RDO.',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  // ─── sign (PDF lock) ──────────────────────────────────────────────────────────

  it('bloqueia assinatura quando o RDO ja possui PDF final governado', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-1',
      file_key: 'documents/rdo.pdf',
    });

    await expect(
      service.sign(RDO_ID, {
        tipo: 'responsavel',
        nome: 'João',
        cpf: '12345678900',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  // ─── assinatura e lifecycle ──────────────────────────────────────────────────

  it('invalida assinaturas e devolve RDO aprovado para enviado quando o conteúdo muda', async () => {
    const rdo = makeRdo({
      status: 'aprovado',
      observacoes: 'Versão original',
      assinatura_responsavel:
        '{"nome":"Resp","cpf":"123","signed_at":"2026-03-16T12:00:00.000Z"}',
      assinatura_engenheiro:
        '{"nome":"Eng","cpf":"456","signed_at":"2026-03-16T12:30:00.000Z"}',
    });
    repository.findOne.mockResolvedValue(rdo);

    const result = await service.update(RDO_ID, {
      observacoes: 'Versão alterada',
    });

    expect(result.status).toBe('enviado');
    expect(result.assinatura_responsavel).toBeNull();
    expect(result.assinatura_engenheiro).toBeNull();
    expect(rdoAuditService.recordEvent).toHaveBeenCalledWith(
      RDO_ID,
      'SIGNATURES_RESET',
      expect.objectContaining({ reason: 'content_changed' }),
    );
  });

  it('limpa assinaturas quando o RDO volta para rascunho', async () => {
    repository.findOne.mockResolvedValue(
      makeRdo({
        status: 'enviado',
        assinatura_responsavel:
          '{"nome":"Resp","cpf":"123","signed_at":"2026-03-16T12:00:00.000Z"}',
        assinatura_engenheiro:
          '{"nome":"Eng","cpf":"456","signed_at":"2026-03-16T12:30:00.000Z"}',
      }),
    );

    const result = await service.updateStatus(RDO_ID, 'rascunho');

    expect(result.status).toBe('rascunho');
    expect(result.assinatura_responsavel).toBeNull();
    expect(result.assinatura_engenheiro).toBeNull();
    expect(rdoAuditService.recordEvent).toHaveBeenCalledWith(
      RDO_ID,
      'SIGNATURES_RESET',
      expect.objectContaining({ reason: 'returned_to_draft' }),
    );
  });

  // ─── savePdf (cleanup on governance failure) ──────────────────────────────────

  it('remove arquivo do storage quando a governanca falha no savePdf', async () => {
    repository.findOne.mockResolvedValue(
      makeRdo({
        status: 'aprovado',
        assinatura_responsavel: '{"nome":"Resp"}',
        assinatura_engenheiro: '{"nome":"Eng"}',
      }),
    );
    (
      documentGovernanceService.registerFinalDocument as jest.Mock
    ).mockRejectedValue(new Error('governance failure'));

    const file = {
      originalname: 'rdo.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-rdo'),
    } as Express.Multer.File;

    await expect(service.savePdf(RDO_ID, file)).rejects.toThrow(
      'governance failure',
    );
    expect(documentStorageService.deleteFile).toHaveBeenCalled();
  });

  // ─── exportExcel ─────────────────────────────────────────────────────────────

  it('exporta planilha Excel com dados dos RDOs', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        makeRdo({
          mao_de_obra: [
            { funcao: 'Pedreiro', quantidade: 5, turno: 'manha', horas: 8 },
          ],
          equipamentos: [
            {
              nome: 'Trator',
              quantidade: 1,
              horas_trabalhadas: 6,
              horas_ociosas: 2,
            },
          ],
          clima_manha: 'ensolarado',
        }),
      ]),
    };
    repository.createQueryBuilder.mockReturnValue(qb);

    const buffer = await service.exportExcel();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('retorna buffer vazio de Excel quando nao ha RDOs', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repository.createQueryBuilder.mockReturnValue(qb);

    const buffer = await service.exportExcel();
    expect(buffer).toBeInstanceOf(Buffer);
  });
});
