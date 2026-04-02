import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  DocumentRegistryEntry,
  DocumentRegistryStatus,
} from './entities/document-registry.entity';
import { TenantService } from '../common/tenant/tenant.service';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import {
  resolveDefaultRetentionDaysForModule,
  resolveRetentionColumnForModule,
} from '../common/storage/document-retention.constants';

type RegistryModule =
  | 'apr'
  | 'pt'
  | 'dds'
  | 'did'
  | 'checklist'
  | 'cat'
  | 'dossier'
  | 'audit'
  | 'nonconformity'
  | 'inspection'
  | 'rdo'
  | 'did';

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
  fileHash?: string | null;
  documentCode?: string | null;
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
    return this.upsertWithManager(this.registryRepository.manager, input);
  }

  async upsertWithManager(
    manager: EntityManager,
    input: UpsertRegistryInput,
  ): Promise<DocumentRegistryEntry> {
    const registryRepository = manager.getRepository(DocumentRegistryEntry);
    const documentDate = this.resolveDocumentDate(input.documentDate);
    const existing = await registryRepository.findOne({
      where: {
        module: input.module,
        entity_id: input.entityId,
        document_type: input.documentType || 'pdf',
      },
    });

    const entity = existing ?? registryRepository.create();
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
    entity.file_hash = input.fileHash
      ? input.fileHash
      : input.fileBuffer
        ? createHash('sha256').update(input.fileBuffer).digest('hex')
        : entity.file_hash || null;
    entity.document_code =
      input.documentCode ||
      entity.document_code ||
      `${input.module.toUpperCase()}-${String(entity.iso_year)}-${String(entity.iso_week).padStart(2, '0')}-${input.entityId.slice(0, 8).toUpperCase()}`;
    entity.created_by = input.createdBy || entity.created_by || null;
    entity.status = DocumentRegistryStatus.ACTIVE;
    entity.expires_at = await this.resolveDocumentExpiryDate(
      manager,
      input.companyId,
      input.module,
      documentDate,
    );

    return registryRepository.save(entity);
  }

  async remove(input: RemoveRegistryInput): Promise<void> {
    await this.removeWithManager(this.registryRepository.manager, input);
  }

  async removeWithManager(
    manager: EntityManager,
    input: RemoveRegistryInput,
  ): Promise<void> {
    const registryRepository = manager.getRepository(DocumentRegistryEntry);
    await registryRepository.delete({
      company_id: input.companyId,
      module: input.module,
      entity_id: input.entityId,
      document_type: input.documentType || 'pdf',
    });
  }

  async findByDocument(
    module: RegistryModule,
    entityId: string,
    documentType = 'pdf',
    companyId?: string,
    includeExpired = false,
  ): Promise<DocumentRegistryEntry | null> {
    return this.registryRepository.findOne({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        module,
        entity_id: entityId,
        document_type: documentType,
        ...(includeExpired ? {} : { status: DocumentRegistryStatus.ACTIVE }),
      },
    });
  }

  async findByHash(hash: string): Promise<DocumentRegistryEntry | null> {
    const normalizedHash = String(hash || '')
      .trim()
      .toLowerCase();
    if (!normalizedHash) {
      return null;
    }

    return this.registryRepository.findOne({
      where: { file_hash: normalizedHash },
    });
  }

  async findByCode(
    code: string,
    companyId: string,
    includeExpired = false,
  ): Promise<DocumentRegistryEntry | null> {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    const normalizedCompanyId = String(companyId || '').trim();
    if (!normalizedCode || !normalizedCompanyId) {
      return null;
    }

    return this.registryRepository
      .createQueryBuilder('document')
      .where('UPPER(document.document_code) = :code', { code: normalizedCode })
      .andWhere('document.company_id = :companyId', {
        companyId: normalizedCompanyId,
      })
      .andWhere(
        includeExpired ? '1=1' : 'document.status = :status',
        includeExpired ? {} : { status: DocumentRegistryStatus.ACTIVE },
      )
      .getOne();
  }

  private async findByCodeAnyTenant(
    code: string,
    includeExpired = false,
  ): Promise<DocumentRegistryEntry | null> {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();
    if (!normalizedCode) {
      return null;
    }

    return this.registryRepository
      .createQueryBuilder('document')
      .where('UPPER(document.document_code) = :code', { code: normalizedCode })
      .andWhere(
        includeExpired ? '1=1' : 'document.status = :status',
        includeExpired ? {} : { status: DocumentRegistryStatus.ACTIVE },
      )
      .getOne();
  }

  async validatePublicCode(input: {
    code: string;
    companyId: string;
    expectedModule?: RegistryModule;
  }): Promise<{
    valid: boolean;
    code: string;
    message?: string;
  }> {
    const normalizedCode = String(input.code || '')
      .trim()
      .toUpperCase();
    const entry = await this.findByCode(normalizedCode, input.companyId);

    if (!entry) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Documento inválido ou não encontrado.',
      };
    }

    if (input.expectedModule && entry.module !== input.expectedModule) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Documento inválido ou não encontrado.',
      };
    }

    return {
      valid: true,
      code: normalizedCode,
    };
  }

  /**
   * Compatibilidade temporária com contrato público legado (sem token).
   * Mantém payload mínimo e não expõe metadados sensíveis.
   */
  async validateLegacyPublicCode(input: {
    code: string;
    expectedModule?: string;
  }): Promise<{
    valid: boolean;
    code: string;
    message?: string;
  }> {
    const normalizedCode = String(input.code || '')
      .trim()
      .toUpperCase();
    const entry = await this.findByCodeAnyTenant(normalizedCode);

    if (!entry) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Documento inválido ou não encontrado.',
      };
    }

    if (input.expectedModule && entry.module !== input.expectedModule) {
      return {
        valid: false,
        code: normalizedCode,
        message: 'Documento inválido ou não encontrado.',
      };
    }

    return {
      valid: true,
      code: normalizedCode,
    };
  }

  async list(filters: WeeklyBundleFilters & { modules?: string[] }) {
    const effectiveCompanyId = this.resolveCompanyId(filters.companyId);
    const query = this.registryRepository
      .createQueryBuilder('document')
      .where('document.company_id = :companyId', {
        companyId: effectiveCompanyId,
      })
      .andWhere('document.status = :status', {
        status: DocumentRegistryStatus.ACTIVE,
      })
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
    return Math.ceil(
      ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
  }

  private getIsoYear(date: Date) {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    return target.getUTCFullYear();
  }

  private async resolveDocumentExpiryDate(
    manager: EntityManager,
    companyId: string,
    moduleName: RegistryModule,
    documentDate: Date,
  ): Promise<Date | null> {
    const fallbackRetentionDays =
      resolveDefaultRetentionDaysForModule(moduleName);
    const retentionColumn = resolveRetentionColumnForModule(moduleName);

    let retentionDays = fallbackRetentionDays;

    if (retentionColumn) {
      try {
        const rowsRaw: unknown = await manager.query(
          `SELECT "${retentionColumn}" AS retention_days FROM "tenant_document_policies" WHERE company_id = $1 LIMIT 1`,
          [companyId],
        );

        const parsedDays = this.extractRetentionDays(rowsRaw);
        if (parsedDays !== null && parsedDays > 0) {
          retentionDays = parsedDays;
        }
      } catch {
        // fallback defensivo para ambientes sem migration aplicada
        retentionDays = fallbackRetentionDays;
      }
    }

    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return null;
    }

    const expiresAt = new Date(documentDate);
    expiresAt.setDate(expiresAt.getDate() + retentionDays);
    return expiresAt;
  }

  private extractRetentionDays(rowsRaw: unknown): number | null {
    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
      return null;
    }

    const rows = rowsRaw as unknown[];
    const firstRow = rows[0];
    if (!firstRow || typeof firstRow !== 'object') {
      return null;
    }

    const retentionDaysRaw = (firstRow as { retention_days?: unknown })
      .retention_days;
    const parsed = Number(retentionDaysRaw);

    return Number.isFinite(parsed) ? parsed : null;
  }
}
