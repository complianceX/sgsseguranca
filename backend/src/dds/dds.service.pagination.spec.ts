import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DDS_DOMAIN_METRICS, DdsService } from './dds.service';
import { Dds } from './entities/dds.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentVideosService } from '../document-videos/document-videos.service';
import { SignaturesService } from '../signatures/signatures.service';
import { MetricsService } from '../common/observability/metrics.service';
import { PublicValidationGrantService } from '../common/services/public-validation-grant.service';
import { DocumentBundleService } from '../common/services/document-bundle.service';
import { User } from '../users/entities/user.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const qb: Record<string, jest.Mock> = {
    select: jest.fn(),
    addSelect: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  // encadeia fluentemente
  Object.keys(qb).forEach((key) => {
    if (!['getRawMany', 'getCount', 'getMany'].includes(key)) {
      qb[key].mockReturnThis();
    }
  });
  return qb;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('DdsService — findAll() pagination', () => {
  let service: DdsService;
  let mockQb: ReturnType<typeof makeMockQueryBuilder>;

  const mockRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const mockUserRepository = {};

  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
    getContext: jest.fn(),
  };

  beforeEach(async () => {
    mockQb = makeMockQueryBuilder();
    mockRepository.createQueryBuilder.mockReturnValue(mockQb);
    mockTenantService.getContext.mockReturnValue(undefined);
    mockRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DdsService,
        { provide: getRepositoryToken(Dds), useValue: mockRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: TenantService, useValue: mockTenantService },
        { provide: DocumentStorageService, useValue: {} },
        { provide: DocumentBundleService, useValue: {} },
        { provide: DocumentGovernanceService, useValue: {} },
        { provide: DocumentVideosService, useValue: {} },
        { provide: SignaturesService, useValue: {} },
        { provide: PublicValidationGrantService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        { provide: DDS_DOMAIN_METRICS, useValue: {} },
      ],
    }).compile();

    service = module.get<DdsService>(DdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve aplicar paginação padrão (page=1, limit=20)', async () => {
    const result = await service.findAll();

    expect(result.page).toBe(1);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    // verifica que .take(20) foi chamado para a query de IDs
    expect(mockQb.take).toHaveBeenCalledWith(20);
    expect(mockQb.skip).toHaveBeenCalledWith(0);
  });

  it('deve respeitar o limite máximo de 100', async () => {
    await service.findAll({ page: 1, limit: 9999 });

    expect(mockQb.take).toHaveBeenCalledWith(100);
  });

  it('deve calcular skip corretamente para page > 1', async () => {
    await service.findAll({ page: 3, limit: 50 });

    expect(mockQb.skip).toHaveBeenCalledWith(100); // (3-1) * 50
    expect(mockQb.take).toHaveBeenCalledWith(50);
  });

  it('deve retornar total correto quando há registros', async () => {
    const fakeIds = [{ id: 'id-1' }, { id: 'id-2' }];
    const fakeDds = [{ id: 'id-1' }, { id: 'id-2' }] as Dds[];

    mockQb.getRawMany.mockResolvedValue(fakeIds);
    mockQb.getCount.mockResolvedValue(2);
    mockRepository.find.mockResolvedValue(fakeDds);

    const result = await service.findAll();

    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.lastPage).toBe(1);
  });

  it('deve aplicar filtro de company_id do tenant', async () => {
    await service.findAll();

    expect(mockQb.andWhere).toHaveBeenCalledWith('dds.company_id = :tenantId', {
      tenantId: 'tenant-uuid',
    });
  });

  it('deve retornar página vazia sem erro quando não há registros', async () => {
    mockQb.getRawMany.mockResolvedValue([]);
    mockQb.getCount.mockResolvedValue(0);

    const result = await service.findAll({ page: 2, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockRepository.find).not.toHaveBeenCalled();
  });
});

describe('DdsService — findAllForExport()', () => {
  let service: DdsService;
  let mockQb: ReturnType<typeof makeMockQueryBuilder>;

  const mockRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const mockUserRepository = {};

  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
  };

  beforeEach(async () => {
    mockQb = makeMockQueryBuilder({ getMany: jest.fn().mockResolvedValue([]) });
    mockRepository.createQueryBuilder.mockReturnValue(mockQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DdsService,
        { provide: getRepositoryToken(Dds), useValue: mockRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: TenantService, useValue: mockTenantService },
        { provide: DocumentStorageService, useValue: {} },
        { provide: DocumentBundleService, useValue: {} },
        { provide: DocumentGovernanceService, useValue: {} },
        { provide: DocumentVideosService, useValue: {} },
        { provide: SignaturesService, useValue: {} },
        { provide: PublicValidationGrantService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        { provide: DDS_DOMAIN_METRICS, useValue: {} },
      ],
    }).compile();

    service = module.get<DdsService>(DdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve limitar a 5000 registros', async () => {
    await service.findAllForExport();

    expect(mockQb.take).toHaveBeenCalledWith(5000);
  });

  it('deve aplicar filtro de tenant', async () => {
    await service.findAllForExport();

    expect(mockQb.andWhere).toHaveBeenCalledWith('dds.company_id = :tenantId', {
      tenantId: 'tenant-uuid',
    });
  });
});

describe('DdsService — listagens filtradas e cursor', () => {
  let service: DdsService;
  let mockQb: ReturnType<typeof makeMockQueryBuilder>;

  const mockRepository = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
  };
  const mockUserRepository = {};

  const mockTenantService = {
    getTenantId: jest.fn().mockReturnValue('tenant-uuid'),
    getContext: jest.fn(),
  };

  beforeEach(async () => {
    mockQb = makeMockQueryBuilder();
    mockRepository.createQueryBuilder.mockReturnValue(mockQb);
    mockRepository.find.mockResolvedValue([]);
    mockTenantService.getContext.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DdsService,
        { provide: getRepositoryToken(Dds), useValue: mockRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: TenantService, useValue: mockTenantService },
        { provide: DocumentStorageService, useValue: {} },
        { provide: DocumentBundleService, useValue: {} },
        { provide: DocumentGovernanceService, useValue: {} },
        { provide: DocumentVideosService, useValue: {} },
        { provide: SignaturesService, useValue: {} },
        { provide: PublicValidationGrantService, useValue: {} },
        { provide: MetricsService, useValue: {} },
        { provide: DDS_DOMAIN_METRICS, useValue: {} },
      ],
    }).compile();

    service = module.get<DdsService>(DdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deve limitar findPaginated a 100 registros por página', async () => {
    await service.findPaginated({ page: 1, limit: 9999 });

    expect(mockQb.take).toHaveBeenCalledWith(100);
  });

  it('retorna lista vazia sem 400 quando usuario de obra nao tem site no contexto', async () => {
    mockTenantService.getContext.mockReturnValue({
      companyId: 'tenant-uuid',
      userId: 'user-tst-sem-obra',
      isSuperAdmin: false,
      siteScope: 'single',
      siteIds: [],
    });

    const result = await service.findPaginated({
      page: 1,
      limit: 10,
      kind: 'regular',
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockQb.andWhere).toHaveBeenCalledWith('1 = 0');
    expect(mockRepository.find).not.toHaveBeenCalled();
  });

  it('deve limitar findByCursor a 100 registros por página', async () => {
    await service.findByCursor({ limit: 9999 });

    expect(mockQb.take).toHaveBeenCalledWith(101);
  });

  it('retorna cursor vazio sem 400 quando usuario de obra nao tem site no contexto', async () => {
    mockTenantService.getContext.mockReturnValue({
      companyId: 'tenant-uuid',
      userId: 'user-tst-sem-obra',
      isSuperAdmin: false,
      siteScope: 'single',
      siteIds: [],
    });

    await expect(service.findByCursor({ limit: 10 })).resolves.toEqual({
      data: [],
      cursor: null,
      hasMore: false,
    });
    expect(mockQb.andWhere).toHaveBeenCalledWith('1 = 0');
    expect(mockRepository.find).not.toHaveBeenCalled();
  });
});
