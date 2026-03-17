import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RdosService } from './rdos.service';
import { Rdo } from './entities/rdo.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';
import type { DocumentStorageService } from '../common/services/document-storage.service';
import type { DocumentGovernanceService } from '../document-registry/document-governance.service';
import type { DocumentRegistryService } from '../document-registry/document-registry.service';

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
  };
  let tenantService: Pick<TenantService, 'getTenantId'>;
  let mailService: Pick<MailService, 'sendMail' | 'sendMailSimple'>;
  let documentStorageService: Pick<
    DocumentStorageService,
    'uploadFile' | 'getSignedUrl' | 'downloadFileBuffer' | 'deleteFile' | 'generateDocumentKey'
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
      create: jest.fn((input) => ({ ...input } as Rdo)),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(defaultQb),
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
      syncFinalDocumentMetadata: jest.fn().mockResolvedValue({ id: 'registry-1' }),
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

    service = new RdosService(
      repository as unknown as Repository<Rdo>,
      tenantService as TenantService,
      mailService as MailService,
      documentStorageService as DocumentStorageService,
      documentGovernanceService as DocumentGovernanceService,
      documentRegistryService as DocumentRegistryService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ──────────────────────────────────────────────────────────────────

  it('cria RDO com numero gerado automaticamente', async () => {
    (repository.createQueryBuilder as jest.Mock).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 'RDO-202603-002' }),
    });
    const dto = { company_id: COMPANY_ID, data: new Date('2026-03-16'), status: 'rascunho' };
    const result = await service.create(dto as any);
    expect(result.numero).toMatch(/^RDO-\d{6}-003$/);
    expect(repository.save).toHaveBeenCalled();
  });

  it('usa company_id do tenant quando o DTO nao fornece', async () => {
    repository.count.mockResolvedValue(0);
    const dto = { data: new Date('2026-03-16') };
    await service.create(dto as any);
    const createdArg = (repository.create as jest.Mock).mock.calls[0][0] as { company_id: string };
    expect(createdArg.company_id).toBe(COMPANY_ID);
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  it('retorna RDO existente pelo ID', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    await expect(service.findOne(RDO_ID)).resolves.toEqual(rdo);
  });

  it('lanca NotFoundException quando RDO nao existe', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  it('atualiza campos do RDO', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.update(RDO_ID, { observacoes: 'Atualizado' } as any);
    expect((result as any).observacoes).toBe('Atualizado');
    expect(repository.save).toHaveBeenCalled();
  });

  // ─── updateStatus ────────────────────────────────────────────────────────────

  it('transiciona status de rascunho para enviado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'rascunho' }));
    const result = await service.updateStatus(RDO_ID, 'enviado');
    expect(result.status).toBe('enviado');
  });

  it('exige assinaturas antes de aprovar o RDO', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'enviado' }));
    await expect(service.updateStatus(RDO_ID, 'aprovado')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('bloqueia transicao de status invalida', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'aprovado' }));
    await expect(service.updateStatus(RDO_ID, 'rascunho')).rejects.toThrow(BadRequestException);
  });

  it('bloqueia transicao direta de rascunho para aprovado', async () => {
    repository.findOne.mockResolvedValue(makeRdo({ status: 'rascunho' }));
    await expect(service.updateStatus(RDO_ID, 'aprovado')).rejects.toThrow(BadRequestException);
  });

  // ─── sign ────────────────────────────────────────────────────────────────────

  it('registra assinatura do responsavel', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.sign(RDO_ID, {
      tipo: 'responsavel',
      nome: 'João Silva',
      cpf: '12345678900',
      hash: 'hash-abc',
      timestamp: '2026-03-16T12:00:00.000Z',
    });
    expect(result.assinatura_responsavel).toBeDefined();
    const parsed = JSON.parse(result.assinatura_responsavel!) as {
      nome: string;
      cpf: string;
      hash: string;
    };
    expect(parsed.nome).toBe('João Silva');
    expect(parsed.cpf).toBe('12345678900');
    expect(parsed.hash).toBe('hash-abc');
  });

  it('registra assinatura do engenheiro', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.sign(RDO_ID, {
      tipo: 'engenheiro',
      nome: 'Ana Engenheira',
      cpf: '98765432100',
      hash: 'hash-eng',
      timestamp: '2026-03-16T14:00:00.000Z',
    });
    expect(result.assinatura_engenheiro).toBeDefined();
    const parsed = JSON.parse(result.assinatura_engenheiro!) as { nome: string };
    expect(parsed.nome).toBe('Ana Engenheira');
  });

  // ─── markPdfSaved ────────────────────────────────────────────────────────────

  it('marca PDF como salvo e preenche campos de arquivo', async () => {
    const rdo = makeRdo({
      status: 'aprovado',
      assinatura_responsavel: '{"nome":"Resp"}',
      assinatura_engenheiro: '{"nome":"Eng"}',
    });
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.markPdfSaved(RDO_ID, { filename: 'rdo-2026.pdf' });
    expect(result.pdf_file_key).toContain('rdo-2026.pdf');
    expect(result.pdf_original_name).toBe('rdo-2026.pdf');
    expect(result.pdf_folder_path).toContain(RDO_ID);
    expect(
      documentGovernanceService.syncFinalDocumentMetadata,
    ).toHaveBeenCalled();
    expect(
      documentGovernanceService.syncFinalDocumentMetadata,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        documentCode: 'RDO-2026-12-11111111',
      }),
    );
  });

  it('bloqueia alteracao quando o RDO ja possui PDF final governado', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    (documentRegistryService.findByDocument as jest.Mock).mockResolvedValue({
      id: 'registry-1',
    });

    await expect(
      service.update(RDO_ID, { observacoes: 'Nao deveria editar' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── sendEmail ───────────────────────────────────────────────────────────────

  it('envia e-mail com dados do RDO para cada destinatario', async () => {
    const rdo = makeRdo({
      numero: 'RDO-202603-001',
      mao_de_obra: [{ funcao: 'Pedreiro', quantidade: 3, turno: 'manha', horas: 8 }],
      equipamentos: [{ nome: 'Escavadeira', quantidade: 1, horas_trabalhadas: 4, horas_ociosas: 0 }],
      servicos_executados: [{ descricao: 'Escavação', percentual_concluido: 50 }],
      ocorrencias: [],
    });
    repository.findOne.mockResolvedValue(rdo);

    await service.sendEmail(RDO_ID, ['gestor@empresa.com', 'eng@empresa.com']);

    expect(mailService.sendMail).toHaveBeenCalledTimes(2);
    const [to, subject, , html] = (mailService.sendMail as jest.Mock).mock.calls[0] as [string, string, string, string];
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
    repository.findOne.mockResolvedValue(makeRdo({ pdf_file_key: 'documents/rdo.pdf' }));
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
    (documentGovernanceService.listFinalDocuments as jest.Mock).mockResolvedValue([
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

  it('lanca NotFoundException ao remover RDO inexistente', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.remove('inexistente')).rejects.toThrow(NotFoundException);
  });

  // ─── generateNumero (via create) ─────────────────────────────────────────────

  it('gera numero sequencial por mes (nao por total da empresa)', async () => {
    (repository.createQueryBuilder as jest.Mock).mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 'RDO-202603-005' }),
    });
    const dto = { company_id: COMPANY_ID, data: new Date('2026-03-16') };
    const result = await service.create(dto as any);
    expect(result.numero).toMatch(/^RDO-\d{6}-006$/);
  });

  it('inicia sequencia em 001 quando nao ha RDOs no mes', async () => {
    // default mock already returns { max: null } — no override needed
    const dto = { company_id: COMPANY_ID, data: new Date('2026-04-01') };
    const result = await service.create(dto as any);
    expect(result.numero).toMatch(/^RDO-\d{6}-001$/);
  });

  // ─── update (status bypass protection) ───────────────────────────────────────

  it('bloqueia alteracao de status pelo endpoint generico de update', async () => {
    repository.findOne.mockResolvedValue(makeRdo());
    await expect(
      service.update(RDO_ID, { status: 'aprovado' } as any),
    ).rejects.toThrow('Use PATCH /rdos/:id/status para alterar o status do RDO.');
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
        hash: 'h',
        timestamp: new Date().toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  // ─── markPdfSaved (validations) ──────────────────────────────────────────────

  it('bloqueia markPdfSaved quando falta assinatura do responsavel', async () => {
    repository.findOne.mockResolvedValue(
      makeRdo({ status: 'aprovado', assinatura_engenheiro: '{"nome":"Eng"}' }),
    );
    await expect(
      service.markPdfSaved(RDO_ID, { filename: 'rdo.pdf' }),
    ).rejects.toThrow('Assinaturas do responsável e do engenheiro são obrigatórias');
    expect(documentGovernanceService.syncFinalDocumentMetadata).not.toHaveBeenCalled();
  });

  it('bloqueia markPdfSaved quando RDO nao esta aprovado', async () => {
    repository.findOne.mockResolvedValue(
      makeRdo({
        status: 'enviado',
        assinatura_responsavel: '{"nome":"Resp"}',
        assinatura_engenheiro: '{"nome":"Eng"}',
      }),
    );
    await expect(
      service.markPdfSaved(RDO_ID, { filename: 'rdo.pdf' }),
    ).rejects.toThrow('Somente RDO aprovado pode receber PDF final');
    expect(documentGovernanceService.syncFinalDocumentMetadata).not.toHaveBeenCalled();
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
    (documentGovernanceService.registerFinalDocument as jest.Mock).mockRejectedValue(
      new Error('governance failure'),
    );

    const file = {
      originalname: 'rdo.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-rdo'),
    } as Express.Multer.File;

    await expect(service.savePdf(RDO_ID, file)).rejects.toThrow('governance failure');
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
          mao_de_obra: [{ funcao: 'Pedreiro', quantidade: 5, turno: 'manha', horas: 8 }],
          equipamentos: [{ nome: 'Trator', quantidade: 1, horas_trabalhadas: 6, horas_ociosas: 2 }],
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
