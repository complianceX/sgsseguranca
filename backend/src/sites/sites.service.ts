import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Site } from './entities/site.entity';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site)
    private sitesRepository: Repository<Site>,
    private tenantService: TenantService,
  ) {}

  async create(createSiteDto: DeepPartial<Site>): Promise<Site> {
    const tenant = this.requireTenantContext();
    if (
      createSiteDto.company_id &&
      createSiteDto.company_id !== tenant.companyId
    ) {
      throw new ForbiddenException('company_id divergente do tenant atual');
    }
    const siteData = {
      ...createSiteDto,
      company_id: tenant.companyId,
      local: createSiteDto.local || createSiteDto.nome,
    };

    const site = this.sitesRepository.create(siteData);
    const saved = await this.sitesRepository.save(site);
    return saved;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<OffsetPage<Site>> {
    const tenant = this.requireTenantContext();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.sitesRepository
      .createQueryBuilder('site')
      .orderBy('site.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    query.where('site.company_id = :companyId', {
      companyId: tenant.companyId,
    });

    if (tenant.siteScope !== 'all') {
      query.andWhere('site.id = :siteId', { siteId: tenant.siteId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = `(
        LOWER(site.nome) LIKE :search
        OR LOWER(COALESCE(site.cidade, '')) LIKE :search
        OR LOWER(COALESCE(site.estado, '')) LIKE :search
      )`;
      query.andWhere(condition, { search });
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findAll(companyId?: string): Promise<Site[]> {
    const tenant = this.requireTenantContext();
    if (companyId && companyId !== tenant.companyId) {
      throw new ForbiddenException('company_id divergente do tenant atual');
    }
    const where =
      tenant.siteScope === 'all'
        ? { company_id: tenant.companyId }
        : { company_id: tenant.companyId, id: tenant.siteId };

    return this.sitesRepository.find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Site> {
    const tenant = this.requireTenantContext();
    if (tenant.siteScope !== 'all' && id !== tenant.siteId) {
      throw new NotFoundException(`Obra/Setor com ID ${id} não encontrado`);
    }
    const site = await this.sitesRepository.findOne({
      where: { id, company_id: tenant.companyId },
    });
    if (!site) {
      throw new NotFoundException(`Obra/Setor com ID ${id} não encontrado`);
    }
    return site;
  }

  async update(id: string, updateSiteDto: DeepPartial<Site>): Promise<Site> {
    const site = await this.findOne(id);
    const { company_id: _ignoredCompanyId, ...safeUpdate } =
      updateSiteDto as DeepPartial<Site> & { company_id?: string };
    if (
      _ignoredCompanyId &&
      _ignoredCompanyId !== this.requireTenantContext().companyId
    ) {
      throw new ForbiddenException('company_id divergente do tenant atual');
    }
    Object.assign(site, safeUpdate);
    site.company_id = this.requireTenantContext().companyId;
    const saved = await this.sitesRepository.save(site);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const site = await this.findOne(id);
    await this.sitesRepository.remove(site);
  }

  private requireTenantContext(): {
    companyId: string;
    siteId?: string;
    siteScope: 'single' | 'all';
  } {
    const context = this.tenantService.getContext();
    const companyId = context?.companyId?.trim();
    if (!companyId) {
      throw new ForbiddenException(
        'Contexto de tenant indisponível para operação em sites',
      );
    }

    const rawSiteScope: 'single' | 'all' =
      context?.siteScope ?? (context?.isSuperAdmin ? 'all' : 'single');
    const siteId = context?.siteId?.trim();

    // Users with 'single' scope but no siteId assigned are treated as company-scoped.
    // This handles roles like TST/ADMIN_EMPRESA whose profile name may not exactly match
    // the Role enum string, causing resolveSiteScope to return 'single' unexpectedly.
    const siteScope: 'single' | 'all' =
      rawSiteScope === 'single' && !siteId ? 'all' : rawSiteScope;

    return { companyId, siteId, siteScope };
  }
}
