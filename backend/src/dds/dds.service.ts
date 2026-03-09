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
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';

@Injectable()
export class DdsService {
  private readonly logger = new Logger(DdsService.name);

  constructor(
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    private tenantService: TenantService,
    private readonly documentBundleService: DocumentBundleService,
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

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.ddsRepository
      .createQueryBuilder('d')
      .where('d.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('d.company_id = :tenantId', { tenantId });
    }
    if (filters.companyId) {
      query.andWhere('d.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((d) => {
        if (!d.created_at) return false;
        const date = new Date(d.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const dt = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(
            ((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
          );
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((d) => ({
        entityId: d.id,
        title: d.tema,
        date: d.data || d.created_at,
        ddsId: d.id,
        data: d.data || d.created_at,
        id: d.id,
        tema: d.tema,
        companyId: d.company_id,
        fileKey: d.pdf_file_key,
        folderPath: d.pdf_folder_path,
        originalName: d.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'DDS',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }
}
