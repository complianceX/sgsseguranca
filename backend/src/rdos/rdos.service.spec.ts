import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RdosService } from './rdos.service';
import { Rdo } from './entities/rdo.entity';
import type { TenantService } from '../common/tenant/tenant.service';
import type { MailService } from '../mail/mail.service';

const COMPANY_ID = 'company-1';
const RDO_ID = 'rdo-uuid-1';

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
  let mailService: Pick<MailService, 'sendMail'>;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((input) => Promise.resolve(input as Rdo)),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((input) => ({ ...input } as Rdo)),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    tenantService = { getTenantId: jest.fn(() => COMPANY_ID) };
    mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    service = new RdosService(
      repository as unknown as Repository<Rdo>,
      tenantService as TenantService,
      mailService as MailService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ──────────────────────────────────────────────────────────────────

  it('cria RDO com numero gerado automaticamente', async () => {
    repository.count.mockResolvedValue(2);
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
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    const result = await service.markPdfSaved(RDO_ID, { filename: 'rdo-2026.pdf' });
    expect(result.pdf_file_key).toContain('rdo-2026.pdf');
    expect(result.pdf_original_name).toBe('rdo-2026.pdf');
    expect(result.pdf_folder_path).toContain(RDO_ID);
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

  // ─── listFiles ───────────────────────────────────────────────────────────────

  it('lista somente RDOs com PDF anexado', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([makeRdo({ pdf_file_key: 'rdos/rdo-1/file.pdf' })]),
    };
    repository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listFiles();
    expect(qb.where).toHaveBeenCalledWith('rdo.pdf_file_key IS NOT NULL');
    expect(result).toHaveLength(1);
  });

  it('filtra listFiles por ano quando informado', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repository.createQueryBuilder.mockReturnValue(qb);

    await service.listFiles({ year: '2026' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('EXTRACT(YEAR'),
      expect.objectContaining({ year: '2026' }),
    );
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  it('remove o RDO pelo ID', async () => {
    const rdo = makeRdo();
    repository.findOne.mockResolvedValue(rdo);
    await expect(service.remove(RDO_ID)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(rdo);
  });

  it('lanca NotFoundException ao remover RDO inexistente', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.remove('inexistente')).rejects.toThrow(NotFoundException);
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
