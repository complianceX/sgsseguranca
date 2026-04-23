/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { DocumentBundleService } from '../common/services/document-bundle.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentRegistryEntry } from './entities/document-registry.entity';
import { DocumentRegistryService } from './document-registry.service';

describe('DocumentRegistryService', () => {
  let service: DocumentRegistryService;
  let registryRepository: jest.Mocked<Repository<DocumentRegistryEntry>>;
  let tenantService: Pick<TenantService, 'getTenantId'>;
  let documentBundleService: Pick<
    DocumentBundleService,
    'buildWeeklyPdfBundle'
  >;
  let queryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    registryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn(),
      manager: {} as Repository<DocumentRegistryEntry>['manager'],
    } as unknown as jest.Mocked<Repository<DocumentRegistryEntry>>;

    tenantService = {
      getTenantId: jest.fn().mockReturnValue('company-1'),
    };

    documentBundleService = {
      buildWeeklyPdfBundle: jest.fn(),
    };

    service = new DocumentRegistryService(
      registryRepository,
      {} as DataSource,
      tenantService as TenantService,
      documentBundleService as DocumentBundleService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('aplica sempre o tenant autenticado na listagem governada', async () => {
    await service.list({
      companyId: 'company-1',
      year: 2026,
      week: 14,
      modules: ['dds'],
    });

    expect(registryRepository.createQueryBuilder).toHaveBeenCalledWith(
      'document',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'document.company_id = :companyId',
      { companyId: 'company-1' },
    );
  });

  it('rejeita company_id divergente do tenant autenticado', async () => {
    await expect(
      service.list({
        companyId: 'company-2',
        year: 2026,
      }),
    ).rejects.toThrow(
      new BadRequestException('company_id divergente do tenant autenticado.'),
    );

    expect(registryRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('mantém compatibilidade para chamadas internas sem tenant usando companyId explícito', async () => {
    (tenantService.getTenantId as jest.Mock).mockReturnValue(undefined);

    await service.list({
      companyId: 'company-internal',
      year: 2026,
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'document.company_id = :companyId',
      { companyId: 'company-internal' },
    );
  });
});
