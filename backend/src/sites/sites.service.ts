import { Injectable, NotFoundException } from '@nestjs/common';
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
    const siteData = {
      ...createSiteDto,
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
    companyId?: string;
  }): Promise<OffsetPage<Site>> {
    const tenantId = this.tenantService.getTenantId();
    const effectiveCompanyId =
      opts?.companyId && (!tenantId || tenantId === opts.companyId)
        ? opts.companyId
        : tenantId;
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.sitesRepository
      .createQueryBuilder('site')
      .orderBy('site.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (effectiveCompanyId) {
      query.where('site.company_id = :companyId', {
        companyId: effectiveCompanyId,
      });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = `(
        LOWER(site.nome) LIKE :search
        OR LOWER(COALESCE(site.cidade, '')) LIKE :search
        OR LOWER(COALESCE(site.estado, '')) LIKE :search
      )`;
      if (effectiveCompanyId) {
        query.andWhere(condition, { search });
      } else {
        query.where(condition, { search });
      }
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findAll(companyId?: string): Promise<Site[]> {
    const tenantId = this.tenantService.getTenantId();
    const effectiveCompanyId =
      companyId && (!tenantId || tenantId === companyId) ? companyId : tenantId;
    // Se não houver tenantId, retorna tudo.
    // Em uma implementação real, verificaríamos se o usuário é Administrador Geral aqui
    // mas o TenantInterceptor já deveria lidar com a lógica de quem tem tenantId
    return this.sitesRepository.find({
      where: effectiveCompanyId ? { company_id: effectiveCompanyId } : {},
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Site> {
    const tenantId = this.tenantService.getTenantId();
    const site = await this.sitesRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });
    if (!site) {
      throw new NotFoundException(`Obra/Setor com ID ${id} não encontrado`);
    }
    return site;
  }

  async update(id: string, updateSiteDto: DeepPartial<Site>): Promise<Site> {
    const site = await this.findOne(id);
    Object.assign(site, updateSiteDto);
    const saved = await this.sitesRepository.save(site);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const site = await this.findOne(id);
    await this.sitesRepository.remove(site);
  }
}
