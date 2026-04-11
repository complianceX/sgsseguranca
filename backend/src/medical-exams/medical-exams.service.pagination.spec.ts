import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MedicalExamsService } from './medical-exams.service';
import { MedicalExam } from './entities/medical-exam.entity';
import { TenantService } from '../common/tenant/tenant.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  Object.keys(qb).forEach((key) => {
    if (!['getManyAndCount', 'getMany'].includes(key)) {
      qb[key].mockReturnThis();
    }
  });
  return qb;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('MedicalExamsService — findAll() pagination', () => {
  let service: MedicalExamsService;
  let mockQb: ReturnType<typeof makeMockQueryBuilder>;

  const mockRepository = { createQueryBuilder: jest.fn() };
  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
  };

  beforeEach(async () => {
    mockQb = makeMockQueryBuilder();
    mockRepository.createQueryBuilder.mockReturnValue(mockQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalExamsService,
        { provide: getRepositoryToken(MedicalExam), useValue: mockRepository },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<MedicalExamsService>(MedicalExamsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve aplicar paginação padrão (page=1, limit=20)', async () => {
    const result = await service.findAll();

    expect(result.page).toBe(1);
    expect(result.total).toBe(0);
    expect(mockQb.take).toHaveBeenCalledWith(20);
    expect(mockQb.skip).toHaveBeenCalledWith(0);
  });

  it('deve respeitar o limite máximo de 1000', async () => {
    await service.findAll({ page: 1, limit: 2000 });

    expect(mockQb.take).toHaveBeenCalledWith(1000);
  });

  it('deve calcular skip corretamente para page > 1', async () => {
    await service.findAll({ page: 2, limit: 20 });

    expect(mockQb.skip).toHaveBeenCalledWith(20); // (2-1) * 20
  });

  it('deve retornar total e data corretos', async () => {
    const fakeExams = [{ id: 'e-1' }, { id: 'e-2' }] as MedicalExam[];
    mockQb.getManyAndCount.mockResolvedValue([fakeExams, 2]);

    const result = await service.findAll();

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.lastPage).toBe(1);
  });

  it('deve aplicar filtro de company_id do tenant', async () => {
    await service.findAll();

    expect(mockQb.andWhere).toHaveBeenCalledWith(
      'exam.company_id = :tenantId',
      {
        tenantId: 'tenant-uuid',
      },
    );
  });

  it('deve usar leftJoinAndSelect para carregar user', async () => {
    await service.findAll();

    expect(mockQb.leftJoinAndSelect).toHaveBeenCalledWith('exam.user', 'user');
  });
});

describe('MedicalExamsService — findAllForExport()', () => {
  let service: MedicalExamsService;
  let mockQb: ReturnType<typeof makeMockQueryBuilder>;

  const mockRepository = { createQueryBuilder: jest.fn() };
  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
  };

  beforeEach(async () => {
    mockQb = makeMockQueryBuilder();
    mockRepository.createQueryBuilder.mockReturnValue(mockQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicalExamsService,
        { provide: getRepositoryToken(MedicalExam), useValue: mockRepository },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<MedicalExamsService>(MedicalExamsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve limitar a 5000 registros', async () => {
    await service.findAllForExport();

    expect(mockQb.take).toHaveBeenCalledWith(5000);
  });

  it('deve aplicar filtro de tenant', async () => {
    await service.findAllForExport();

    expect(mockQb.andWhere).toHaveBeenCalledWith(
      'exam.company_id = :tenantId',
      {
        tenantId: 'tenant-uuid',
      },
    );
  });

  it('não deve usar leftJoinAndSelect (sem relação user no export)', async () => {
    await service.findAllForExport();

    expect(mockQb.leftJoinAndSelect).not.toHaveBeenCalled();
  });
});
