import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DeepPartial } from 'typeorm';
import { Site } from './entities/site.entity';
import { TenantService } from '../../shared/tenant/tenant.service';
import { resolveSiteAccessScopeFromTenantService } from '../../shared/tenant/site-access-scope.util';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../../shared/utils/offset-pagination.util';
import { normalizeOptionalSearchQuery } from '../../shared/utils/query-normalization.util';
import { escapeLikePattern } from '../../shared/utils/sql.util';

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
    const tenant = this.requireTenantContext({ allowMissingSiteScope: true });
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.sitesRepository
      .createQueryBuilder('site')
      .orderBy('site.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    query
      .where('site.company_id = :companyId', {
        companyId: tenant.companyId,
      })
      .andWhere('site.deleted_at IS NULL');

    if (tenant.siteScope !== 'all') {
      if (tenant.siteIds.length === 0) {
        query.andWhere('1 = 0');
      } else {
        query.andWhere('site.id IN (:...siteIds)', {
          siteIds: tenant.siteIds,
        });
      }
    }

    const searchTerm = normalizeOptionalSearchQuery(opts?.search);
    if (searchTerm) {
      const search = `%${escapeLikePattern(searchTerm.toLowerCase())}%`;
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
    const tenant = this.requireTenantContext({ allowMissingSiteScope: true });
    if (companyId && companyId !== tenant.companyId) {
      throw new ForbiddenException('company_id divergente do tenant atual');
    }
    if (tenant.siteScope !== 'all' && tenant.siteIds.length === 0) {
      return [];
    }
    const where =
      tenant.siteScope === 'all'
        ? { company_id: tenant.companyId }
        : { company_id: tenant.companyId, id: In(tenant.siteIds) };

    return this.sitesRepository.find({
      where,
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Site> {
    const tenant = this.requireTenantContext();
    if (tenant.siteScope !== 'all' && !tenant.siteIds.includes(id)) {
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
    // Soft delete: dezenas de tabelas (aprs, pts, dds, checklists, audits,
    // epi_assignments, corrective_actions, nonconformities, cats, rdos,
    // service_orders, dids, arrs, expenses, signatures...) têm FK para
    // sites.id sem ON DELETE CASCADE. Hard delete além de violar a FK em
    // qualquer obra com documento vinculado, destruiria a trilha probatória
    // de documentos de SST com retenção legal (mesmo padrão de companies.service).
    await this.findOne(id);
    await this.sitesRepository.softDelete(id);
  }

  private requireTenantContext(options?: { allowMissingSiteScope?: boolean }): {
    companyId: string;
    siteId?: string;
    siteIds: string[];
    siteScope: 'single' | 'all';
  } {
    const scope = resolveSiteAccessScopeFromTenantService(
      this.tenantService,
      'sites',
      options,
    );

    return {
      companyId: scope.companyId,
      siteId: scope.siteId,
      siteIds: scope.siteIds,
      siteScope: scope.siteScope,
    };
  }
}
