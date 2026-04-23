import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TrainingsService } from './trainings.service';
import { Training } from './entities/training.entity';
import { TenantService } from '../common/tenant/tenant.service';

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TrainingsService — findAll() pagination', () => {
  let service: TrainingsService;

  const mockRepository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((input: Partial<Training>) => input),
    save: jest.fn((input: Partial<Training>) =>
      Promise.resolve(input as Training),
    ),
  };
  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: getRepositoryToken(Training), useValue: mockRepository },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<TrainingsService>(TrainingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve aplicar paginação padrão (page=1, limit=20)', async () => {
    const result = await service.findAll();

    expect(result.page).toBe(1);
    expect(result.total).toBe(0);
    expect(mockRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('deve respeitar o limite máximo de 100', async () => {
    await service.findAll({ page: 1, limit: 9999 });

    expect(mockRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('deve calcular skip corretamente para page > 1', async () => {
    await service.findAll({ page: 5, limit: 50 });

    expect(mockRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200, take: 50 }), // (5-1) * 50
    );
  });

  it('deve retornar total e data corretos', async () => {
    const fakeTrainings = [{ id: 't-1' }, { id: 't-2' }] as Training[];
    mockRepository.findAndCount.mockResolvedValue([fakeTrainings, 2]);

    const result = await service.findAll();

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.lastPage).toBe(1);
  });

  it('deve filtrar por company_id do tenant', async () => {
    await service.findAll();

    expect(mockRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { company_id: 'tenant-uuid' },
      }),
    );
  });

  it('rejeita company_id forjado no payload de criação', async () => {
    await expect(
      service.create({
        nome: 'NR22',
        data_conclusao: '2026-03-01',
        data_vencimento: '2027-03-01',
        user_id: '11111111-1111-4111-8111-111111111111',
        company_id: 'tenant-forjado',
      } as never),
    ).rejects.toThrow('company_id não é permitido no payload');

    expect(mockRepository.create).not.toHaveBeenCalled();
  });
});

describe('TrainingsService — findAllForExport()', () => {
  let service: TrainingsService;

  const mockRepository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
  };
  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: getRepositoryToken(Training), useValue: mockRepository },
        { provide: TenantService, useValue: mockTenantService },
      ],
    }).compile();

    service = module.get<TrainingsService>(TrainingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve limitar a 5000 registros', async () => {
    await service.findAllForExport();

    expect(mockRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5000 }),
    );
  });

  it('deve filtrar por company_id do tenant', async () => {
    await service.findAllForExport();

    expect(mockRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { company_id: 'tenant-uuid' } }),
    );
  });
});
