import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NonConformity } from './entities/nonconformity.entity';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { StorageService } from '../common/services/storage.service';
import { format, startOfWeek, endOfWeek } from 'date-fns';

@Injectable()
export class NonConformitiesService {
  constructor(
    @InjectRepository(NonConformity)
    private nonConformitiesRepository: Repository<NonConformity>,
    private tenantService: TenantService,
    private storageService: StorageService,
  ) {}

  async create(createNonConformityDto: CreateNonConformityDto) {
    const nonConformity = this.nonConformitiesRepository.create({
      ...createNonConformityDto,
      company_id: this.tenantService.getTenantId(),
    });
    return this.nonConformitiesRepository.save(nonConformity);
  }

  async findAll() {
    const tenantId = this.tenantService.getTenantId();
    return this.nonConformitiesRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['site'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string) {
    const tenantId = this.tenantService.getTenantId();
    const nonConformity = await this.nonConformitiesRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'company'],
    });

    if (!nonConformity) {
      throw new NotFoundException(
        `Não conformidade com ID ${id} não encontrada`,
      );
    }

    return nonConformity;
  }

  async update(id: string, updateNonConformityDto: UpdateNonConformityDto) {
    const nonConformity = await this.findOne(id);
    Object.assign(nonConformity, updateNonConformityDto);
    return this.nonConformitiesRepository.save(nonConformity);
  }

  async remove(id: string) {
    const nonConformity = await this.findOne(id);
    await this.nonConformitiesRepository.remove(nonConformity);
  }

  async listStoredFiles(filters: {
    companyId?: string;
    year?: number;
    week?: number;
  }) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.nonConformitiesRepository
      .createQueryBuilder('nc')
      .where('nc.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('nc.company_id = :tenantId', { tenantId });
    }

    if (filters.companyId) {
      query.andWhere('nc.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    // Filtragem por ano e semana (se fornecido)
    return results
      .filter((nc) => {
        if (!nc.created_at) return false;
        const date = new Date(nc.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const ncWeek = parseInt(format(date, 'I')); // ISO week
          if (ncWeek !== filters.week) return false;
        }
        return true;
      })
      .map((nc) => ({
        id: nc.id,
        codigo_nc: nc.codigo_nc,
        data_identificacao: nc.data_identificacao,
        companyId: nc.company_id,
        fileKey: nc.pdf_file_key,
        folderPath: nc.pdf_folder_path,
        originalName: nc.pdf_original_name,
      }));
  }

  async getPdfAccess(id: string) {
    const nc = await this.findOne(id);
    if (!nc.pdf_file_key) {
      throw new NotFoundException('Arquivo PDF não encontrado para esta NC');
    }

    const url = await this.storageService.getPresignedDownloadUrl(
      nc.pdf_file_key,
    );
    return {
      entityId: nc.id,
      fileKey: nc.pdf_file_key,
      folderPath: nc.pdf_folder_path,
      originalName: nc.pdf_original_name,
      url,
    };
  }

  async attachPdf(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ) {
    const nc = await this.findOne(id);
    const date = new Date();
    const year = date.getFullYear();
    const week = format(date, 'I');
    const folderPath = `nonconformities/${nc.company_id}/${year}/week-${week}`;
    const fileKey = `${folderPath}/${id}.pdf`;

    await this.storageService.uploadFile(fileKey, buffer, mimetype);

    nc.pdf_file_key = fileKey;
    nc.pdf_folder_path = folderPath;
    nc.pdf_original_name = originalName;

    return this.nonConformitiesRepository.save(nc);
  }

  async count(options?: any): Promise<number> {
    return this.nonConformitiesRepository.count(options);
  }
}
