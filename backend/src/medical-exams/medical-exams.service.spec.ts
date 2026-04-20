import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MedicalExamsService } from './medical-exams.service';
import { MedicalExam } from './entities/medical-exam.entity';
import { CreateMedicalExamDto } from './dto/create-medical-exam.dto';
import { UpdateMedicalExamDto } from './dto/update-medical-exam.dto';
import type { TenantService } from '../common/tenant/tenant.service';

const COMPANY_ID = 'company-1';
const EXAM_ID = 'exam-uuid-1';

function makeExam(overrides: Partial<MedicalExam> = {}): MedicalExam {
  return {
    id: EXAM_ID,
    company_id: COMPANY_ID,
    tipo_exame: 'periodico',
    resultado: 'apto',
    data_exame: new Date('2026-01-10'),
    data_vencimento: new Date('2027-01-10'),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as MedicalExam;
}

const makeExamUser = (nome: string): MedicalExam['user'] =>
  ({ nome }) as MedicalExam['user'];

const getFirstCreateArg = (
  createMock: jest.Mock,
): Partial<MedicalExam> & { company_id?: string } => {
  const firstCall = createMock.mock.calls[0] as
    | [Partial<MedicalExam>]
    | undefined;

  if (!firstCall) {
    throw new Error('repository.create não foi chamado.');
  }

  return firstCall[0];
};

const getFirstFindArg = (
  findMock: jest.Mock,
): { where?: { company_id?: string } } => {
  const firstCall = findMock.mock.calls[0] as
    | [{ where?: { company_id?: string } }]
    | undefined;

  if (!firstCall) {
    throw new Error('repository.find não foi chamado.');
  }

  return firstCall[0];
};

function makeQueryBuilder(results: MedicalExam[] = []) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([results, results.length]),
    getMany: jest.fn().mockResolvedValue(results),
  };
}

describe('MedicalExamsService', () => {
  const originalEnv = { ...process.env };
  let service: MedicalExamsService;
  let repository: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let tenantService: Pick<TenantService, 'getTenantId'>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FIELD_ENCRYPTION_ENABLED: 'true',
      FIELD_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    repository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((input) => Promise.resolve(input as MedicalExam)),
      create: jest.fn((input) => ({ ...input }) as MedicalExam),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => makeQueryBuilder()),
    };
    tenantService = { getTenantId: jest.fn(() => COMPANY_ID) };

    service = new MedicalExamsService(
      repository as unknown as Repository<MedicalExam>,
      tenantService as TenantService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  it('cria exame medico com company_id do tenant', async () => {
    const dto: CreateMedicalExamDto = {
      tipo_exame: 'admissional',
      resultado: 'apto',
      data_realizacao: '2026-03-01',
      user_id: '11111111-1111-1111-1111-111111111111',
    };
    await service.create(dto);
    const createdArg = getFirstCreateArg(repository.create);
    expect(createdArg.company_id).toBe(COMPANY_ID);
    expect(repository.save).toHaveBeenCalled();
  });

  it('criptografa campos sensíveis médicos em repouso e retorna decriptado na resposta', async () => {
    const dto: CreateMedicalExamDto = {
      tipo_exame: 'periodico',
      resultado: 'apto',
      data_realizacao: '2026-03-01',
      user_id: '11111111-1111-1111-1111-111111111111',
      medico_responsavel: 'Dr. Alice',
      crm_medico: 'CRM-12345',
      observacoes: 'Apto sem restrições',
    };

    repository.save.mockImplementationOnce(async (payload: MedicalExam) => ({
      ...payload,
      id: EXAM_ID,
      company_id: COMPANY_ID,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const result = await service.create(dto);

    const createdArg = getFirstCreateArg(repository.create);
    expect(createdArg.medico_responsavel).toMatch(/^enc:v1:/);
    expect(createdArg.crm_medico).toMatch(/^enc:v1:/);
    expect(createdArg.observacoes).toMatch(/^enc:v1:/);

    expect(result.medico_responsavel).toBe('Dr. Alice');
    expect(result.crm_medico).toBe('CRM-12345');
    expect(result.observacoes).toBe('Apto sem restrições');
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  it('retorna exame existente pelo ID', async () => {
    const exam = makeExam();
    repository.findOne.mockResolvedValue(exam);
    await expect(service.findOne(EXAM_ID)).resolves.toEqual(exam);
  });

  it('lanca NotFoundException quando exame nao existe', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne('inexistente')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  it('atualiza campos do exame medico', async () => {
    const exam = makeExam();
    repository.findOne.mockResolvedValue(exam);
    const dto: UpdateMedicalExamDto = {
      resultado: 'inapto',
    };
    const result = await service.update(EXAM_ID, dto);
    expect(result.resultado).toBe('inapto');
    expect(repository.save).toHaveBeenCalled();
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  it('remove exame medico pelo ID', async () => {
    const exam = makeExam();
    repository.findOne.mockResolvedValue(exam);
    await expect(service.remove(EXAM_ID)).resolves.toBeUndefined();
    expect(repository.remove).toHaveBeenCalledWith(exam);
  });

  // ─── findExpirySummary ───────────────────────────────────────────────────────

  it('calcula corretamente o resumo de vencimentos', async () => {
    const now = new Date();
    const vencido = makeExam({
      id: 'exam-1',
      data_vencimento: new Date(now.getTime() - 86_400_000), // ontem
    });
    const vencendoEm20Dias = makeExam({
      id: 'exam-2',
      data_vencimento: new Date(now.getTime() + 20 * 86_400_000),
    });
    const emDia = makeExam({
      id: 'exam-3',
      data_vencimento: new Date(now.getTime() + 90 * 86_400_000),
    });
    const semVencimento = makeExam({
      id: 'exam-4',
      data_vencimento: null,
    });

    repository.find.mockResolvedValue([
      vencido,
      vencendoEm20Dias,
      emDia,
      semVencimento,
    ]);

    const summary = await service.findExpirySummary();
    expect(summary.total).toBe(4);
    expect(summary.expired).toBe(1);
    expect(summary.expiringSoon).toBe(1);
    expect(summary.valid).toBe(1);
  });

  it('retorna zeros quando nao ha exames', async () => {
    repository.find.mockResolvedValue([]);
    const summary = await service.findExpirySummary();
    expect(summary).toEqual({
      total: 0,
      expired: 0,
      expiringSoon: 0,
      valid: 0,
    });
  });

  it('aplica filtro de tenant no findExpirySummary', async () => {
    repository.find.mockResolvedValue([]);
    await service.findExpirySummary();
    const findCall = getFirstFindArg(repository.find);
    expect(findCall.where).toEqual({ company_id: COMPANY_ID });
  });

  // ─── dispatchExpiryNotifications ─────────────────────────────────────────────

  it('retorna contagem de exames com vencimento proximo', async () => {
    const qb = makeQueryBuilder([makeExam(), makeExam({ id: 'exam-2' })]);
    repository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.dispatchExpiryNotifications(30);
    expect(result.dispatched).toBe(2);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  // ─── exportExcel ─────────────────────────────────────────────────────────────

  it('exporta planilha com dados dos exames', async () => {
    const now = new Date();
    const qb = makeQueryBuilder([
      makeExam({
        tipo_exame: 'periodico',
        resultado: 'apto',
        data_vencimento: new Date(now.getTime() + 60 * 86_400_000),
        user: makeExamUser('Colaborador A'),
      }),
    ]);
    repository.createQueryBuilder.mockReturnValue(qb);

    const buffer = await service.exportExcel();
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('marca status como Vencido quando data_vencimento esta no passado', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const qb = makeQueryBuilder([makeExam({ data_vencimento: yesterday })]);
    repository.createQueryBuilder.mockReturnValue(qb);

    // Deve gerar o buffer sem lançar exceção
    await expect(service.exportExcel()).resolves.toBeInstanceOf(Buffer);
  });
});
