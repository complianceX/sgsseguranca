import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Apr } from './entities/apr.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateAprDto } from './dto/create-apr.dto';
import { UpdateAprDto } from './dto/update-apr.dto';
import { Activity } from '../activities/entities/activity.entity';
import { Risk } from '../risks/entities/risk.entity';
import { Epi } from '../epis/entities/epi.entity';
import { Tool } from '../tools/entities/tool.entity';
import { Machine } from '../machines/entities/machine.entity';
import { User } from '../users/entities/user.entity';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

@Injectable()
export class AprsService {
  private readonly logger = new Logger(AprsService.name);

  constructor(
    @InjectRepository(Apr)
    private aprsRepository: Repository<Apr>,
    private tenantService: TenantService,
  ) {}

  async create(createAprDto: CreateAprDto): Promise<Apr> {
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      createAprDto;

    if (rest.is_modelo_padrao) {
      rest.is_modelo = true;
    }

    const apr = this.aprsRepository.create({
      ...rest,
      company_id: this.tenantService.getTenantId(),
      activities: activities?.map((id) => ({ id }) as unknown as Activity),
      risks: risks?.map((id) => ({ id }) as unknown as Risk),
      epis: epis?.map((id) => ({ id }) as unknown as Epi),
      tools: tools?.map((id) => ({ id }) as unknown as Tool),
      machines: machines?.map((id) => ({ id }) as unknown as Machine),
      participants: participants?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({
      event: 'apr_created',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Apr[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.aprsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<Apr>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [data, total] = await this.aprsRepository.findAndCount({
      where: tenantId ? { company_id: tenantId } : {},
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();
    const apr = await this.aprsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: [
        'company',
        'site',
        'elaborador',
        'activities',
        'risks',
        'epis',
        'tools',
        'machines',
        'participants',
        'auditado_por',
      ],
    });
    if (!apr) {
      throw new NotFoundException(`APR com ID ${id} não encontrada`);
    }
    return apr;
  }

  async update(id: string, updateAprDto: UpdateAprDto): Promise<Apr> {
    const apr = await this.findOne(id);
    const { activities, risks, epis, tools, machines, participants, ...rest } =
      updateAprDto;

    const next = { ...rest };
    if (next.is_modelo_padrao) {
      next.is_modelo = true;
    }
    if (next.is_modelo === false) {
      next.is_modelo_padrao = false;
    }
    Object.assign(apr, next);

    if (activities) {
      apr.activities = activities.map((id) => ({ id }) as unknown as Activity);
    }
    if (risks) {
      apr.risks = risks.map((id) => ({ id }) as unknown as Risk);
    }
    if (epis) {
      apr.epis = epis.map((id) => ({ id }) as unknown as Epi);
    }
    if (tools) {
      apr.tools = tools.map((id) => ({ id }) as unknown as Tool);
    }
    if (machines) {
      apr.machines = machines.map((id) => ({ id }) as unknown as Machine);
    }
    if (participants) {
      apr.participants = participants.map((id) => ({ id }) as unknown as User);
    }

    const saved = await this.aprsRepository.save(apr);
    if (saved.is_modelo_padrao) {
      await this.aprsRepository.update(
        { company_id: saved.company_id },
        { is_modelo_padrao: false },
      );
      await this.aprsRepository.update(
        { id: saved.id },
        { is_modelo_padrao: true, is_modelo: true },
      );
    }
    this.logger.log({
      event: 'apr_updated',
      aprId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const apr = await this.findOne(id);
    await this.aprsRepository.remove(apr);
    this.logger.log({
      event: 'apr_removed',
      aprId: apr.id,
      companyId: apr.company_id,
    });
  }

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.aprsRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }
}
