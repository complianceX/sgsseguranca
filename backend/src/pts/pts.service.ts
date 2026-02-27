import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pt } from './entities/pt.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PtsService {
  private readonly logger = new Logger(PtsService.name);

  constructor(
    @InjectRepository(Pt)
    private ptsRepository: Repository<Pt>,
    private tenantService: TenantService,
  ) {}

  async create(createPtDto: CreatePtDto): Promise<Pt> {
    const { executantes, ...rest } = createPtDto;

    const pt = this.ptsRepository.create({
      ...rest,
      company_id: this.tenantService.getTenantId(),
      executantes: executantes?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ptsRepository.save(pt);
    this.logger.log({
      event: 'pt_created',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Pt[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.ptsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site', 'apr', 'responsavel', 'executantes', 'auditado_por'],
    });
  }

  async findOne(id: string): Promise<Pt> {
    const tenantId = this.tenantService.getTenantId();
    const pt = await this.ptsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'apr', 'responsavel', 'executantes', 'auditado_por'],
    });
    if (!pt) {
      throw new NotFoundException(`PT com ID ${id} não encontrada`);
    }
    return pt;
  }

  async update(id: string, updatePtDto: UpdatePtDto): Promise<Pt> {
    const pt = await this.findOne(id);
    const { executantes, ...rest } = updatePtDto;

    Object.assign(pt, rest);

    if (executantes) {
      pt.executantes = executantes.map((id) => ({ id }) as unknown as User);
    }

    const saved = await this.ptsRepository.save(pt);
    this.logger.log({
      event: 'pt_updated',
      ptId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const pt = await this.findOne(id);
    await this.ptsRepository.remove(pt);
  }

  async count(options?: any): Promise<number> {
    return this.ptsRepository.count(options);
  }
}
