import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { Site } from './entities/site.entity';
import { TenantService } from '../common/tenant/tenant.service';

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
