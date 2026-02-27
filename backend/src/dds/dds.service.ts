import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dds } from './entities/dds.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { User } from '../users/entities/user.entity';

@Injectable()
export class DdsService {
  private readonly logger = new Logger(DdsService.name);

  constructor(
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    private tenantService: TenantService,
  ) {}

  async create(createDdsDto: CreateDdsDto): Promise<Dds> {
    const { participants, company_id, ...rest } = createDdsDto;
    const tenantId = this.tenantService.getTenantId();
    const resolvedCompanyId = tenantId || company_id;
    if (!resolvedCompanyId) {
      throw new BadRequestException('Empresa não definida para o DDS');
    }

    const dds = this.ddsRepository.create({
      ...rest,
      company_id: resolvedCompanyId,
      participants: participants?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_created',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Dds[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.ddsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site', 'facilitador', 'participants'],
    });
  }

  async findOne(id: string): Promise<Dds> {
    const tenantId = this.tenantService.getTenantId();
    const dds = await this.ddsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'facilitador', 'participants'],
    });
    if (!dds) {
      throw new NotFoundException(`DDS com ID ${id} não encontrado`);
    }
    return dds;
  }

  async update(id: string, updateDdsDto: UpdateDdsDto): Promise<Dds> {
    const dds = await this.findOne(id);
    const { participants, ...rest } = updateDdsDto;

    Object.assign(dds, rest);

    if (participants) {
      dds.participants = participants.map((id) => ({ id }) as unknown as User);
    }

    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_updated',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const dds = await this.findOne(id);
    await this.ddsRepository.remove(dds);
    this.logger.log({
      event: 'dds_removed',
      ddsId: dds.id,
      companyId: dds.company_id,
    });
  }

  async count(options?: any): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.ddsRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }
}
