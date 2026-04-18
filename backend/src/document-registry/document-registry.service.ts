import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
import {
  DdsApprovalAction,
  DdsApprovalRecord,
} from '../dds/entities/dds-approval-record.entity';
import { Dds } from '../dds/entities/dds.entity';

type RegistryModule =
  | 'apr'
  | 'pt'
  | 'dds'
  | 'did'
  | 'arr'
  | 'checklist'
  | 'cat'
  | 'dossier'
  | 'audit'
  | 'nonconformity'
  | 'inspection'
  | 'rdo';

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
    private readonly dataSource: DataSource,
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
        company_id: input.companyId,
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

  async resolvePublicCodeScope(input: {
    code: string;
    expectedModule?: string;
  }): Promise<{ companyId: string; module: string } | null> {
    const entry = await this.findByCodeAnyTenant(input.code, true);
    if (!entry) {
      return null;
    }

    if (input.expectedModule && entry.module !== input.expectedModule) {
      return null;
    }

    return {
      companyId: entry.company_id,
      module: entry.module,
    };
  }

  async validatePublicCode(input: {
    code: string;
    companyId: string;
    expectedModule?: RegistryModule;
  }): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
    approval_summary?: {
      status: 'approved';
      cycle: number | null;
      event_hash: string | null;
      approved_by: string | null;
      approved_at: string | null;
      signature_hash: string | null;
      signature_signed_at: string | null;
      timestamp_authority: string | null;
    } | null;
    dds?: {
      id: string;
      tema: string;
      status: string;
      data: string | null;
      company_name: string | null;
      site_name: string | null;
      facilitator_name: string | null;
      participant_count: number;
      audit_result: string | null;
      audited_at: string | null;
      audited_by: string | null;
      emitted_by: string | null;
      emitted_at: string | null;
      final_pdf_hash: string | null;
    } | null;
    approval_timeline?: Array<{
      cycle: number;
      level_order: number;
      title: string;
      approver_role: string;
      action: string;
      actor_name: string | null;
      event_at: string | null;
      event_hash: string | null;
      signature_hash: string | null;
      signature_signed_at: string | null;
      timestamp_authority: string | null;
    }> | null;
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

    const ddsArtifacts =
      entry.module === 'dds'
        ? await this.resolveDdsValidationArtifacts(entry)
        : null;

    return {
      valid: true,
      code: normalizedCode,
      document: {
        id: entry.entity_id,
        module: entry.module,
        document_type: entry.document_type,
        title: entry.title,
        document_date: entry.document_date?.toISOString() || null,
        original_name: entry.original_name,
        file_hash: entry.file_hash,
        updated_at: entry.updated_at.toISOString(),
      },
      final_document: {
        has_final_pdf: Boolean(entry.file_key),
        document_code: entry.document_code,
        original_name: entry.original_name,
        file_hash: entry.file_hash,
        emitted_at: entry.created_at?.toISOString() || null,
      },
      approval_summary: ddsArtifacts?.approvalSummary || null,
      dds: ddsArtifacts?.dds || null,
      approval_timeline: ddsArtifacts?.approvalTimeline || null,
    };
  }

  private async resolveDdsValidationArtifacts(
    entry: DocumentRegistryEntry,
  ): Promise<{
    approvalSummary: {
      status: 'approved';
      cycle: number | null;
      event_hash: string | null;
      approved_by: string | null;
      approved_at: string | null;
      signature_hash: string | null;
      signature_signed_at: string | null;
      timestamp_authority: string | null;
    } | null;
    dds: {
      id: string;
      tema: string;
      status: string;
      data: string | null;
      company_name: string | null;
      site_name: string | null;
      facilitator_name: string | null;
      participant_count: number;
      audit_result: string | null;
      audited_at: string | null;
      audited_by: string | null;
      emitted_by: string | null;
      emitted_at: string | null;
      final_pdf_hash: string | null;
    } | null;
    approvalTimeline: Array<{
      cycle: number;
      level_order: number;
      title: string;
      approver_role: string;
      action: string;
      actor_name: string | null;
      event_at: string | null;
      event_hash: string | null;
      signature_hash: string | null;
      signature_signed_at: string | null;
      timestamp_authority: string | null;
    }> | null;
  }> {
    const ddsRepository = this.dataSource.getRepository(Dds);
    const approvalRepository = this.dataSource.getRepository(DdsApprovalRecord);

    const [dds, participantRow, approvalRecords] = await Promise.all([
      ddsRepository.findOne({
        where: {
          id: entry.entity_id,
          company_id: entry.company_id,
        },
        relations: [
          'company',
          'site',
          'facilitador',
          'auditado_por',
          'emitted_by',
        ],
      }),
      ddsRepository
        .createQueryBuilder('dds')
        .leftJoin('dds.participants', 'participant')
        .select('COUNT(participant.id)', 'participant_count')
        .where('dds.id = :ddsId', { ddsId: entry.entity_id })
        .andWhere('dds.company_id = :companyId', {
          companyId: entry.company_id,
        })
        .getRawOne<{ participant_count?: string | null }>(),
      approvalRepository.find({
        where: {
          company_id: entry.company_id,
          dds_id: entry.entity_id,
        },
        relations: ['actor'],
        order: {
          cycle: 'ASC',
          level_order: 'ASC',
          event_at: 'ASC',
          created_at: 'ASC',
        },
      }),
    ]);

    const participantCount =
      Number(participantRow?.participant_count || 0) || 0;
    const activeCycle =
      approvalRecords.length > 0
        ? Math.max(...approvalRecords.map((record) => record.cycle))
        : null;
    const activeCycleRecords =
      activeCycle == null
        ? []
        : approvalRecords.filter((record) => record.cycle === activeCycle);
    const latestApprovedRecord = [...activeCycleRecords]
      .reverse()
      .find((record) => record.action === DdsApprovalAction.APPROVED);
    const approvalTimeline = activeCycleRecords
      .filter((record) => record.action !== DdsApprovalAction.PENDING)
      .map((record) => ({
        cycle: record.cycle,
        level_order: record.level_order,
        title: record.title,
        approver_role: record.approver_role,
        action: record.action,
        actor_name: record.actor?.nome || record.actor_user_id || null,
        event_at: record.event_at?.toISOString() || null,
        event_hash: record.event_hash || null,
        signature_hash: record.actor_signature_hash || null,
        signature_signed_at:
          record.actor_signature_signed_at?.toISOString() || null,
        timestamp_authority: record.actor_signature_timestamp_authority || null,
      }));

    return {
      approvalSummary: latestApprovedRecord
        ? {
            status: 'approved',
            cycle: latestApprovedRecord.cycle ?? null,
            event_hash: latestApprovedRecord.event_hash || null,
            approved_by:
              latestApprovedRecord.actor?.nome ||
              latestApprovedRecord.actor_user_id ||
              null,
            approved_at: latestApprovedRecord.event_at?.toISOString() || null,
            signature_hash: latestApprovedRecord.actor_signature_hash || null,
            signature_signed_at:
              latestApprovedRecord.actor_signature_signed_at?.toISOString() ||
              null,
            timestamp_authority:
              latestApprovedRecord.actor_signature_timestamp_authority || null,
          }
        : null,
      dds: dds
        ? {
            id: dds.id,
            tema: dds.tema,
            status: dds.status,
            data: dds.data?.toISOString?.().slice(0, 10) || null,
            company_name: dds.company?.razao_social || null,
            site_name: dds.site?.nome || null,
            facilitator_name: dds.facilitador?.nome || null,
            participant_count: participantCount,
            audit_result: dds.resultado_auditoria || null,
            audited_at: dds.data_auditoria?.toISOString() || null,
            audited_by: dds.auditado_por?.nome || null,
            emitted_by: dds.emitted_by?.nome || null,
            emitted_at: dds.pdf_generated_at?.toISOString() || null,
            final_pdf_hash: dds.final_pdf_hash_sha256 || null,
          }
        : null,
      approvalTimeline: approvalTimeline.length > 0 ? approvalTimeline : null,
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
