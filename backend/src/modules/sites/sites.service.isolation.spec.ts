import type { Repository } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TenantService } from '../../shared/tenant/tenant.service';
import { Site } from './entities/site.entity';
import { SitesService } from './sites.service';

const COMPANY_ID = 'company-uuid-1';
const SITE_ID = 'site-uuid-1';
const OTHER_SITE_ID = 'site-uuid-2';

const makeSite = (overrides: Partial<Site> = {}): Site =>
  ({
    id: SITE_ID,
    nome: 'Obra Central',
    local: 'São Paulo',
    company_id: COMPANY_ID,
    status: true,
    ...overrides,
  }) as Site;

const makeQb = () => ({
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
});

const makeTenantService = (
  opts: {
    companyId?: string;
    siteScope?: 'all' | 'single';
    siteIds?: string[];
  } = {},
) =>
  ({
    getContext: jest.fn().mockReturnValue({
      companyId: opts.companyId ?? COMPANY_ID,
      isSuperAdmin: false,
      siteScope: opts.siteScope ?? 'all',
      siteIds: opts.siteIds ?? [],
    }),
  }) as unknown as jest.Mocked<TenantService>;

const makeRepo = (): jest.Mocked<Repository<Site>> =>
  ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((d: Partial<Site>) => d as Site),
    save: jest.fn((e: Site) => Promise.resolve(e)),
    remove: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
  }) as unknown as jest.Mocked<Repository<Site>>;

describe('SitesService — isolamento de tenant', () => {
  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('injeta company_id do tenant, ignorando o do payload', async () => {
      const repo = makeRepo();
      repo.save.mockResolvedValueOnce(makeSite());
      const service = new SitesService(repo, makeTenantService());

      await service.create({ nome: 'Obra Nova' });

      const created = repo.create.mock.calls[0][0] as Partial<Site>;
      expect(created.company_id).toBe(COMPANY_ID);
    });

    it('lança ForbiddenException quando company_id do payload diverge do tenant', async () => {
      const service = new SitesService(makeRepo(), makeTenantService());

      await expect(
        service.create({ nome: 'Obra', company_id: 'outro-tenant' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('usa nome como local quando local não é fornecido', async () => {
      const repo = makeRepo();
      repo.save.mockResolvedValueOnce(makeSite({ local: 'Obra Norte' }));
      const service = new SitesService(repo, makeTenantService());

      await service.create({ nome: 'Obra Norte' });

      const created = repo.create.mock.calls[0][0] as Partial<Site>;
      expect(created.local).toBe('Obra Norte');
    });
  });

  describe('findOne', () => {
    it('retorna site quando pertence ao tenant', async () => {
      const repo = makeRepo();
      const site = makeSite();
      repo.findOne.mockResolvedValueOnce(site);
      const service = new SitesService(repo, makeTenantService());

      const result = await service.findOne(SITE_ID);
      expect(result.id).toBe(SITE_ID);
    });

    it('aplica filtro de tenant na query', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(makeSite());
      const service = new SitesService(repo, makeTenantService());

      await service.findOne(SITE_ID);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ company_id: COMPANY_ID }),
        }),
      );
    });

    it('lança NotFoundException quando site não existe no tenant', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(null);
      const service = new SitesService(repo, makeTenantService());

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança NotFoundException quando usuário site-scoped tenta acessar obra de outro scope', async () => {
      const repo = makeRepo();
      // Usuário tem acesso apenas ao OTHER_SITE_ID, não ao SITE_ID
      const service = new SitesService(
        repo,
        makeTenantService({
          siteScope: 'single',
          siteIds: [OTHER_SITE_ID],
        }),
      );

      await expect(service.findOne(SITE_ID)).rejects.toThrow(NotFoundException);
      // Não deve nem chegar no banco
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('permite acesso quando site está no siteIds do usuário', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(makeSite());
      const service = new SitesService(
        repo,
        makeTenantService({
          siteScope: 'single',
          siteIds: [SITE_ID],
        }),
      );

      const result = await service.findOne(SITE_ID);
      expect(result.id).toBe(SITE_ID);
    });
  });

  describe('findAll', () => {
    it('busca todas as obras do tenant quando scope é all', async () => {
      const repo = makeRepo();
      repo.find.mockResolvedValueOnce([makeSite()]);
      const service = new SitesService(repo, makeTenantService());

      const result = await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ company_id: COMPANY_ID }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('retorna array vazio quando usuário site-scoped não tem obras no contexto', async () => {
      const service = new SitesService(
        makeRepo(),
        makeTenantService({ siteScope: 'single', siteIds: [] }),
      );

      const result = await service.findAll();
      expect(result).toEqual([]);
    });

    it('lança ForbiddenException quando companyId do parâmetro diverge do tenant', async () => {
      const service = new SitesService(makeRepo(), makeTenantService());

      await expect(service.findAll('outro-tenant')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('preserva company_id do tenant ao atualizar sem company_id no payload', async () => {
      const repo = makeRepo();
      const existingSite = makeSite();
      repo.findOne.mockResolvedValueOnce(existingSite);
      repo.save.mockResolvedValueOnce(makeSite({ nome: 'Novo Nome' }));
      const service = new SitesService(repo, makeTenantService());

      await service.update(SITE_ID, { nome: 'Novo Nome' });

      const saved = repo.save.mock.calls[0][0] as Site;
      expect(saved.company_id).toBe(COMPANY_ID);
    });

    it('lança ForbiddenException quando company_id explícito diverge do tenant', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(makeSite());
      const tenantService = makeTenantService();
      // mock second call to requireTenantContext (inside update after findOne)
      (tenantService.getContext as jest.Mock).mockReturnValue({
        companyId: COMPANY_ID,
        isSuperAdmin: false,
        siteScope: 'all',
        siteIds: [],
      });
      const service = new SitesService(repo, tenantService);

      await expect(
        service.update(SITE_ID, {
          nome: 'Obra',
          company_id: 'tenant-malicioso',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lança NotFoundException ao atualizar site inexistente', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(null);
      const service = new SitesService(repo, makeTenantService());

      await expect(
        service.update('inexistente', { nome: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('remove (soft-delete) site do tenant correto', async () => {
      const repo = makeRepo();
      const site = makeSite();
      repo.findOne.mockResolvedValueOnce(site);
      const service = new SitesService(repo, makeTenantService());

      await service.remove(SITE_ID);

      // Soft delete: hard delete quebraria FKs de aprs/pts/dds/checklists/...
      // e destruiria retenção legal de documentos de SST vinculados à obra.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.softDelete).toHaveBeenCalledWith(SITE_ID);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('lança NotFoundException ao remover site inexistente', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValueOnce(null);
      const service = new SitesService(repo, makeTenantService());

      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('não remove site de outro tenant (site-scoped bloqueia antes de chegar no DB)', async () => {
      const repo = makeRepo();
      const service = new SitesService(
        repo,
        makeTenantService({ siteScope: 'single', siteIds: [OTHER_SITE_ID] }),
      );

      await expect(service.remove(SITE_ID)).rejects.toThrow(NotFoundException);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});
