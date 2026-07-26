import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MedicalExamsService } from './medical-exams.service';
import { MedicalExam } from './entities/medical-exam.entity';
import type { TenantService } from '../../shared/tenant/tenant.service';

const COMPANY_ID = 'company-uuid-1';
const USER_ID = 'user-uuid-1';
const EXAM_ID = 'exam-uuid-1';

const makeExam = (overrides: Partial<MedicalExam> = {}): MedicalExam =>
  ({
    id: EXAM_ID,
    company_id: COMPANY_ID,
    user_id: USER_ID,
    tipo_exame: 'periodico',
    resultado: 'apto',
    data_realizacao: new Date('2025-01-10'),
    data_vencimento: new Date('2026-01-10'),
    medico_responsavel: null,
    crm_medico: null,
    observacoes: null,
    resultado_auditoria: null,
    notas_auditoria: null,
    created_at: new Date(),
    updated_at: new Date(),
    deletedAt: null,
    ...overrides,
  }) as MedicalExam;

const makeService = () => {
  const originalEnv = { ...process.env };
  process.env.FIELD_ENCRYPTION_ENABLED = 'true';
  process.env.FIELD_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const queryBuilderMock = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  };

  const repository = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((input: MedicalExam) => Promise.resolve(input)),
    create: jest.fn(
      (input: Partial<MedicalExam>) => ({ ...input }) as MedicalExam,
    ),
    remove: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => queryBuilderMock),
  };

  const tenantService: Pick<TenantService, 'getTenantId'> = {
    getTenantId: jest.fn(() => COMPANY_ID),
  };

  const service = new MedicalExamsService(
    repository as unknown as Repository<MedicalExam>,
    tenantService as TenantService,
  );

  return { service, repository, tenantService, originalEnv };
};

describe('MedicalExamsService — validações de cadastro', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.FIELD_ENCRYPTION_ENABLED = 'true';
    process.env.FIELD_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('create — validação de datas', () => {
    it('lança BadRequestException quando data_vencimento <= data_realizacao (vencimento anterior)', async () => {
      const { service } = makeService();

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'periodico',
          resultado: 'apto',
          data_realizacao: '2025-06-01',
          data_vencimento: '2025-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando data_vencimento === data_realizacao', async () => {
      const { service } = makeService();

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'periodico',
          resultado: 'apto',
          data_realizacao: '2025-06-01',
          data_vencimento: '2025-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita quando data_vencimento > data_realizacao', async () => {
      const { service, repository } = makeService();
      repository.save.mockResolvedValueOnce(makeExam());

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'periodico',
          resultado: 'apto',
          data_realizacao: '2025-01-10',
          data_vencimento: '2026-01-10',
        }),
      ).resolves.toBeDefined();
    });

    it('aceita quando apenas data_realizacao é fornecida (sem data_vencimento)', async () => {
      const { service, repository } = makeService();
      repository.save.mockResolvedValueOnce(makeExam());

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'admissional',
          resultado: 'apto',
          data_realizacao: '2025-01-10',
        }),
      ).resolves.toBeDefined();
    });

    it('aceita quando apenas data_vencimento é fornecida (sem data_realizacao)', async () => {
      const { service, repository } = makeService();
      repository.save.mockResolvedValueOnce(makeExam());

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'periodico',
          resultado: 'apto',
          data_vencimento: '2026-01-10',
        } as never),
      ).resolves.toBeDefined();
    });

    it('rejeita company_id no payload', async () => {
      const { service } = makeService();

      await expect(
        service.create({
          user_id: USER_ID,
          tipo_exame: 'periodico',
          resultado: 'apto',
          company_id: 'tentativa-de-injecao',
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('persiste com company_id do tenant, não do payload', async () => {
      const { service, repository } = makeService();
      repository.save.mockResolvedValueOnce(makeExam());

      await service.create({
        user_id: USER_ID,
        tipo_exame: 'periodico',
        resultado: 'apto',
      } as never);

      const arg = repository.create.mock.calls[0][0];
      expect(arg.company_id).toBe(COMPANY_ID);
    });
  });

  describe('update — validação de datas', () => {
    it('lança BadRequestException quando nova data_vencimento <= data_realizacao existente', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(
        makeExam({ data_realizacao: new Date('2025-06-01') }),
      );

      await expect(
        service.update(EXAM_ID, { data_vencimento: '2025-05-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException quando nova data_realizacao >= data_vencimento existente', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(
        makeExam({ data_vencimento: new Date('2025-06-01') }),
      );

      await expect(
        service.update(EXAM_ID, { data_realizacao: '2025-07-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita atualização quando datas resultantes são válidas', async () => {
      const { service, repository } = makeService();
      const exam = makeExam({
        data_realizacao: new Date('2025-01-10'),
        data_vencimento: new Date('2026-01-10'),
      });
      repository.findOne.mockResolvedValueOnce(exam);
      repository.save.mockResolvedValueOnce({
        ...exam,
        data_vencimento: new Date('2027-01-10'),
      });

      await expect(
        service.update(EXAM_ID, { data_vencimento: '2027-01-10' }),
      ).resolves.toBeDefined();
    });

    it('aceita atualização sem alterar datas', async () => {
      const { service, repository } = makeService();
      const exam = makeExam();
      repository.findOne.mockResolvedValueOnce(exam);
      repository.save.mockResolvedValueOnce({ ...exam, resultado: 'inapto' });

      await expect(
        service.update(EXAM_ID, { resultado: 'inapto' }),
      ).resolves.toBeDefined();
    });

    it('lança NotFoundException quando exame não existe no tenant', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update('inexistente', { resultado: 'apto' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne — isolamento de tenant', () => {
    it('retorna exame quando encontrado no tenant', async () => {
      const { service, repository } = makeService();
      const exam = makeExam();
      repository.findOne.mockResolvedValueOnce(exam);

      const result = await service.findOne(EXAM_ID);
      expect(result.id).toBe(EXAM_ID);
    });

    it('lança NotFoundException quando exame não existe', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aplica filtro de tenant na query de findOne', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(makeExam());

      await service.findOne(EXAM_ID);

      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ company_id: COMPANY_ID }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('remove exame existente', async () => {
      const { service, repository } = makeService();
      const exam = makeExam();
      repository.findOne.mockResolvedValueOnce(exam);

      await service.remove(EXAM_ID);

      expect(repository.softDelete).toHaveBeenCalledWith(exam.id);
    });

    it('lança NotFoundException ao remover exame inexistente', async () => {
      const { service, repository } = makeService();
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
