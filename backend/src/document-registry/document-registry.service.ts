import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { DocumentRegistryEntry } from './entities/document-registry.entity';
import { TenantService } from '../common/tenant/tenant.service';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';

type RegistryModule =
  | 'apr'
  | 'pt'
  | 'dds'
  | 'checklist'
  | 'audit'
  | 'nonconformity';

type UpsertRegistryInput = {
  companyId: string;
  module: RegistryModule;
  entityId: string;
  title: string;
  documentDate?: Date | string | null;
  fileKey: string;
  folderPath?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  fileBuffer?: Buffer | null;
  createdBy?: string | null;
  documentType?: string;
};

type RemoveRegistryInput = {
  companyId: string;
  module: RegistryModule;
  entityId: string;
  documentType?: string;
};

@Injectable()
export class DocumentRegistryService {
  constructor(
    @InjectRepository(DocumentRegistryEntry)
    private readonly registryRepository: Repository<DocumentRegistryEntry>,
    private readonly tenantService: TenantService,
    private readonly documentBundleService: DocumentBundleService,
  ) {}

  async upsert(input: UpsertRegistryInput): Promise<DocumentRegistryEntry> {
    const documentDate = this.resolveDocumentDate(input.documentDate);
    const existing = await this.registryRepository.findOne({
      where: {
        module: input.module,
        entity_id: input.entityId,
        document_type: input.documentType || 'pdf',
      },
    });

    const entity = existing ?? this.registryRepository.create();
    entity.company_id = input.companyId;
    entity.module = input.module;
    entity.document_type = input.documentType || 'pdf';
    entity.entity_id = input.entityId;
    entity.title = input.title;
    entity.document_date = documentDate;
    entity.iso_year = this.getIsoYear(documentDate);
    entity.iso_week = this.getIsoWeek(documentDate);
    entity.file_key = input.fileKey;
    entity.folder_path = input.folderPath || null;
    entity.original_name = input.originalName || null;
    entity.mime_type = input.mimeType || 'application/pdf';
    entity.file_hash = input.fileBuffer
      ? createHash('sha256').update(input.fileBuffer).digest('hex')
      : entity.file_hash || null;
    entity.document_code =
      entity.document_code ||
      `${input.module.toUpperCase()}-${String(entity.iso_year)}-${String(entity.iso_week).padStart(2, '0')}-${input.entityId.slice(0, 8).toUpperCase()}`;
    entity.created_by = input.createdBy || entity.created_by || null;

    return this.registryRepository.save(entity);
  }

  async remove(input: RemoveRegistryInput): Promise<void> {
    await this.registryRepository.delete({
      company_id: input.companyId,
      module: input.module,
      entity_id: input.entityId,
      document_type: input.documentType || 'pdf',
    });
  }

  async list(filters: WeeklyBundleFilters & { modules?: string[] }) {
    const effectiveCompanyId = this.resolveCompanyId(filters.companyId);
    const query = this.registryRepository
      .createQueryBuilder('document')
      .where('document.company_id = :companyId', { companyId: effectiveCompanyId })
      .orderBy('document.document_date', 'DESC')
      .addOrderBy('document.created_at', 'DESC');

    if (filters.year) {
      query.andWhere('document.iso_year = :year', { year: filters.year });
    }
    if (filters.week) {
      query.andWhere('document.iso_week = :week', { week: filters.week });
    }
    if (filters.modules?.length) {
      query.andWhere('document.module IN (:...modules)', {
        modules: filters.modules,
      });
    }

    return query.getMany();
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters & { modules?: string[] }) {
    if (!filters.year || !filters.week) {
      throw new BadRequestException(
        'Ano e semana são obrigatórios para gerar o pacote consolidado.',
      );
    }

    const documents = await this.list(filters);

    return this.documentBundleService.buildWeeklyPdfBundle(
      'Documentos',
      filters,
      documents.map((document) => ({
        fileKey: document.file_key,
        title: `[${document.module.toUpperCase()}] ${document.title}`,
        originalName: document.original_name,
        date: document.document_date,
      })),
    );
  }

  private resolveCompanyId(companyId?: string) {
    const tenantId = this.tenantService.getTenantId();
    const effectiveCompanyId = tenantId || companyId;

    if (!effectiveCompanyId) {
      throw new BadRequestException(
        'Empresa é obrigatória para consultar o registry documental.',
      );
    }

    return effectiveCompanyId;
  }

  private resolveDocumentDate(input?: Date | string | null) {
    if (!input) {
      return new Date();
    }

    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private getIsoWeek(date: Date) {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private getIsoYear(date: Date) {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    return target.getUTCFullYear();
  }
}
