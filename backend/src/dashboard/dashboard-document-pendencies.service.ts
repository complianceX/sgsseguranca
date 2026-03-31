import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { StorageService } from '../common/services/storage.service';
import {
  normalizeOffsetPagination,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { Company } from '../companies/entities/company.entity';
import { Dds, DdsStatus } from '../dds/entities/dds.entity';
import { DocumentImport } from '../document-import/entities/document-import.entity';
import { DocumentImportStatus } from '../document-import/entities/document-import-status.enum';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';
import { DocumentVideoAttachment } from '../document-videos/entities/document-video-attachment.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Pt, PtStatus } from '../pts/entities/pt.entity';
import { Rdo } from '../rdos/entities/rdo.entity';
import { Signature } from '../signatures/entities/signature.entity';
import { Site } from '../sites/entities/site.entity';
import {
  DocumentPendencyCriticality,
  DocumentPendencyType,
  getDocumentModuleLabel,
  getDocumentPendencyCriticalityWeight,
  getDocumentPendencyTypeLabel,
  resolveDocumentPendencyCriticality,
} from './dashboard-document-pendencies.classifier';
import {
  DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS,
  DashboardDocumentPendenciesFilters,
  DashboardDocumentPendenciesResponse,
  DashboardDocumentPendencyAllowedAction,
  DashboardDocumentPendencyItem,
  DocumentPendencyAction,
  NormalizedDashboardDocumentPendenciesFilters,
} from './dashboard-document-pendency.types';

type LightweightDocumentMetadata = {
  companyId: string;
  siteId: string | null;
  status: string | null;
  documentCode: string | null;
  title: string | null;
};

type NcGovernedAttachmentReferencePayload = {
  v: 1;
  kind: 'governed-storage';
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes?: number | null;
};

const NC_GOVERNED_ATTACHMENT_PREFIX = 'gst:nc-attachment:';
const ALLOWED_DOCUMENT_AVAILABILITY_MODULES = new Set([
  'apr',
  'pt',
  'dds',
  'checklist',
  'inspection',
  'rdo',
  'cat',
  'audit',
  'nonconformity',
]);
const MISSING_FINAL_PDF_MODULES = new Set([
  'apr',
  'pt',
  'dds',
  'checklist',
  'rdo',
  'cat',
]);
const MISSING_SIGNATURE_MODULES = new Set([
  'apr',
  'pt',
  'dds',
  'checklist',
  'rdo',
]);
const VIDEO_MODULES = new Set(['dds', 'rdo', 'inspection']);
const ATTACHMENT_MODULES = new Set(['nonconformity', 'cat']);

type AprReplacementTarget = {
  documentId: string;
  href: string;
};

const DEFAULT_DOCUMENT_PENDENCIES_CACHE_TTL_SECONDS = 90;
const DEFAULT_STORAGE_AVAILABILITY_CACHE_TTL_SECONDS = 120;

@Injectable()
export class DashboardDocumentPendenciesService {
  private readonly logger = new Logger(DashboardDocumentPendenciesService.name);

  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(Audit)
    private readonly auditsRepository: Repository<Audit>,
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(Dds)
    private readonly ddsRepository: Repository<Dds>,
    @InjectRepository(DocumentImport)
    private readonly documentImportsRepository: Repository<DocumentImport>,
    @InjectRepository(DocumentRegistryEntry)
    private readonly documentRegistryRepository: Repository<DocumentRegistryEntry>,
    @InjectRepository(DocumentVideoAttachment)
    private readonly documentVideosRepository: Repository<DocumentVideoAttachment>,
    @InjectRepository(Inspection)
    private readonly inspectionsRepository: Repository<Inspection>,
    @InjectRepository(NonConformity)
    private readonly nonConformitiesRepository: Repository<NonConformity>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Rdo)
    private readonly rdosRepository: Repository<Rdo>,
    @InjectRepository(Signature)
    private readonly signaturesRepository: Repository<Signature>,
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    private readonly documentStorageService: DocumentStorageService,
    private readonly storageService: StorageService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async getDocumentPendencies(input: {
    filters?: DashboardDocumentPendenciesFilters;
    currentCompanyId?: string;
    isSuperAdmin?: boolean;
    permissions?: string[];
  }): Promise<DashboardDocumentPendenciesResponse> {
    const filters = this.normalizeFilters(input.filters);
    const permissionSet = new Set(input.permissions || []);
    const effectiveCompanyId = this.resolveEffectiveCompanyId({
      requestedCompanyId: filters.companyId,
      currentCompanyId: input.currentCompanyId,
      isSuperAdmin: input.isSuperAdmin,
    });
    const cacheKey = this.buildCacheKey({
      filters,
      effectiveCompanyId,
      isSuperAdmin: Boolean(input.isSuperAdmin),
      permissions: Array.from(permissionSet).sort(),
    });
    const cached = await this.readFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const sourceResults = await Promise.allSettled([
      this.collectMissingFinalPdfPendencies(filters, effectiveCompanyId),
      this.collectMissingSignaturePendencies(filters, effectiveCompanyId),
      this.collectDegradedDocumentAvailabilityPendencies(
        filters,
        effectiveCompanyId,
      ),
      this.collectFailedImportPendencies(filters, effectiveCompanyId),
      this.collectUnavailableGovernedVideoPendencies(
        filters,
        effectiveCompanyId,
      ),
      this.collectUnavailableGovernedAttachmentPendencies(
        filters,
        effectiveCompanyId,
      ),
    ]);

    const failedSources: string[] = [];
    const items = sourceResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      const sourceName = [
        'missing-final-pdf',
        'missing-signature',
        'degraded-document-availability',
        'failed-import',
        'unavailable-governed-video',
        'unavailable-governed-attachment',
      ][index];
      failedSources.push(sourceName);
      this.logger.error({
        event: 'dashboard_document_pendencies_source_failed',
        source: sourceName,
        errorMessage:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
      return [];
    });

    const filteredItems = this.applyFilters(items, {
      ...filters,
      companyId: effectiveCompanyId,
    });
    const authorizedItems = filteredItems.filter((item) =>
      this.canViewPendencyItem(item, permissionSet),
    );
    const summary = this.buildSummary(authorizedItems);
    const sortedItems = authorizedItems.sort((left, right) => {
      const criticalityDelta =
        getDocumentPendencyCriticalityWeight(right.criticality) -
        getDocumentPendencyCriticalityWeight(left.criticality);
      if (criticalityDelta !== 0) {
        return criticalityDelta;
      }

      const leftTime = left.relevantDate
        ? new Date(left.relevantDate).getTime()
        : 0;
      const rightTime = right.relevantDate
        ? new Date(right.relevantDate).getTime()
        : 0;
      return rightTime - leftTime;
    });

    const { page, limit, skip } = normalizeOffsetPagination(filters, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const pageSlice = sortedItems.slice(skip, skip + limit);
    const companiesMap = await this.buildCompaniesMap(pageSlice);
    const sitesMap = await this.buildSitesMap(pageSlice);
    const aprReplacementTargets =
      await this.buildAprReplacementTargets(pageSlice);
    const paginated = toOffsetPage(pageSlice, sortedItems.length, page, limit);

    const response: DashboardDocumentPendenciesResponse = {
      degraded: failedSources.length > 0,
      failedSources,
      summary,
      filtersApplied: {
        companyId: effectiveCompanyId,
        siteId: filters.siteId,
        module: filters.module,
        criticality: filters.criticality,
        status: filters.status,
        dateFrom: filters.dateFrom?.toISOString() || undefined,
        dateTo: filters.dateTo?.toISOString() || undefined,
      },
      pagination: {
        page: paginated.page,
        limit,
        total: paginated.total,
        lastPage: paginated.lastPage,
      },
      items: paginated.data.map((item) =>
        this.attachOperationalContext({
          item: {
            ...item,
            companyName: companiesMap.get(item.companyId) || null,
            siteName: item.siteId ? sitesMap.get(item.siteId) || null : null,
          },
          permissions: permissionSet,
          aprReplacementTargets,
        }),
      ),
    };

    // Evita fixar estado degradado em cache; quando houver falha de fonte,
    // deixamos apenas a resposta em memória da request atual.
    if (!response.degraded) {
      await this.writeToCache(cacheKey, response);
    }

    return response;
  }

  private buildCacheKey(input: {
    filters: NormalizedDashboardDocumentPendenciesFilters;
    effectiveCompanyId?: string;
    isSuperAdmin: boolean;
    permissions: string[];
  }): string {
    const payload = {
      companyId: input.effectiveCompanyId || null,
      isSuperAdmin: input.isSuperAdmin,
      permissions: input.permissions,
      filters: {
        companyId: input.filters.companyId || null,
        siteId: input.filters.siteId || null,
        module: input.filters.module || null,
        criticality: input.filters.criticality || null,
        status: input.filters.status || null,
        dateFrom: input.filters.dateFrom
          ? input.filters.dateFrom.toISOString()
          : null,
        dateTo: input.filters.dateTo ? input.filters.dateTo.toISOString() : null,
        page: input.filters.page,
        limit: input.filters.limit,
      },
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return `dashboard:document-pendencies:${hash}`;
  }

  private getCacheTtlMs(): number {
    const parsed = Number(
      process.env.DASHBOARD_DOCUMENT_PENDENCIES_CACHE_TTL_SECONDS ||
        DEFAULT_DOCUMENT_PENDENCIES_CACHE_TTL_SECONDS,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_DOCUMENT_PENDENCIES_CACHE_TTL_SECONDS * 1000;
    }
    const seconds = Math.min(Math.max(Math.floor(parsed), 15), 300);
    return seconds * 1000;
  }

  private async readFromCache(
    key: string,
  ): Promise<DashboardDocumentPendenciesResponse | null> {
    try {
      const cached =
        await this.cacheManager.get<DashboardDocumentPendenciesResponse>(key);
      return cached || null;
    } catch {
      return null;
    }
  }

  private async writeToCache(
    key: string,
    value: DashboardDocumentPendenciesResponse,
  ): Promise<void> {
    try {
      await this.cacheManager.set(key, value, this.getCacheTtlMs());
    } catch {
      // Melhor esforço: falha de cache não pode impactar o endpoint.
    }
  }

  private getStorageAvailabilityCacheTtlMs(): number {
    const parsed = Number(
      process.env.DASHBOARD_STORAGE_AVAILABILITY_CACHE_TTL_SECONDS ||
        DEFAULT_STORAGE_AVAILABILITY_CACHE_TTL_SECONDS,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_STORAGE_AVAILABILITY_CACHE_TTL_SECONDS * 1000;
    }
    const seconds = Math.min(Math.max(Math.floor(parsed), 15), 600);
    return seconds * 1000;
  }

  private buildStorageAvailabilityCacheKey(
    provider: 'document' | 'generic',
    storageKey: string,
  ): string {
    const hash = createHash('sha1')
      .update(`${provider}:${storageKey}`)
      .digest('hex');
    return `dashboard:storage-availability:${hash}`;
  }

  private async isStorageObjectAvailable(input: {
    provider: 'document' | 'generic';
    storageKey: string;
    resolver: () => Promise<string | null | undefined>;
  }): Promise<boolean> {
    const cacheKey = this.buildStorageAvailabilityCacheKey(
      input.provider,
      input.storageKey,
    );

    try {
      const cached = await this.cacheManager.get<{ available: boolean }>(
        cacheKey,
      );
      if (cached && typeof cached.available === 'boolean') {
        return cached.available;
      }
    } catch {
      // no-op: falha de cache não pode quebrar o fluxo
    }

    let available = false;
    try {
      const signedUrl = await input.resolver();
      available = Boolean(signedUrl);
    } catch {
      available = false;
    }

    try {
      await this.cacheManager.set(
        cacheKey,
        { available },
        this.getStorageAvailabilityCacheTtlMs(),
      );
    } catch {
      // no-op: melhor esforço
    }

    return available;
  }

  private normalizeFilters(
    raw?: DashboardDocumentPendenciesFilters,
  ): NormalizedDashboardDocumentPendenciesFilters {
    const { page, limit } = normalizeOffsetPagination(raw, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const requestedCriticality =
      typeof raw?.criticality === 'string'
        ? raw.criticality
        : typeof raw?.priority === 'string'
          ? raw.priority
          : undefined;

    return {
      companyId: this.normalizeStringFilter(raw?.companyId),
      siteId: this.normalizeStringFilter(raw?.siteId),
      module: this.normalizeStringFilter(raw?.module)?.toLowerCase(),
      criticality: this.normalizeCriticality(requestedCriticality),
      status: this.normalizeStringFilter(raw?.status),
      dateFrom: this.parseDate(raw?.dateFrom, 'start'),
      dateTo: this.parseDate(raw?.dateTo, 'end'),
      page,
      limit,
    };
  }

  private resolveEffectiveCompanyId(input: {
    requestedCompanyId?: string;
    currentCompanyId?: string;
    isSuperAdmin?: boolean;
  }): string | undefined {
    if (input.isSuperAdmin) {
      return input.requestedCompanyId || input.currentCompanyId || undefined;
    }

    return input.currentCompanyId || undefined;
  }

  private async collectMissingFinalPdfPendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    if (filters.module && !MISSING_FINAL_PDF_MODULES.has(filters.module)) {
      return [];
    }

    const [aprs, pts, ddsItems, checklists, rdos, cats] = await Promise.all([
      this.aprsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: AprStatus.APROVADA,
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'titulo',
          'status',
          'aprovado_em',
          'updated_at',
        ],
      }),
      this.ptsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          status: In([
            PtStatus.APROVADA,
            PtStatus.ENCERRADA,
            PtStatus.EXPIRADA,
          ]),
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'titulo',
          'status',
          'aprovado_em',
          'updated_at',
        ],
      }),
      this.ddsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: In([
            DdsStatus.PUBLICADO,
            DdsStatus.AUDITADO,
            DdsStatus.ARQUIVADO,
          ]),
          pdf_file_key: IsNull(),
        },
        select: ['id', 'company_id', 'site_id', 'tema', 'status', 'updated_at'],
      }),
      this.checklistsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: Not('Pendente'),
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'titulo',
          'status',
          'updated_at',
        ],
      }),
      this.rdosRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          status: 'aprovado',
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'status',
          'updated_at',
        ],
      }),
      this.catsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          status: 'fechada',
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'status',
          'closed_at',
          'updated_at',
        ],
      }),
    ]);

    return [
      ...aprs.map((apr) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'apr',
          companyId: apr.company_id,
          siteId: apr.site_id,
          documentId: apr.id,
          documentCode: apr.numero,
          title: apr.titulo,
          status: apr.status,
          availabilityStatus: 'not_emitted',
          relevantDate: apr.aprovado_em || apr.updated_at,
          message:
            'APR aprovada sem PDF final governado. O fechamento oficial ainda não foi concluído.',
          action: this.buildAction('Emitir PDF final', 'apr', apr.id),
        }),
      ),
      ...pts.map((pt) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'pt',
          companyId: pt.company_id,
          siteId: pt.site_id,
          documentId: pt.id,
          documentCode: pt.numero,
          title: pt.titulo,
          status: pt.status,
          availabilityStatus: 'not_emitted',
          relevantDate: pt.aprovado_em || pt.updated_at,
          message:
            'PT em fase de fechamento sem PDF final governado. O documento oficial ainda não foi emitido.',
          action: this.buildAction('Abrir PT', 'pt', pt.id),
        }),
      ),
      ...ddsItems.map((dds) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'dds',
          companyId: dds.company_id,
          siteId: dds.site_id,
          documentId: dds.id,
          documentCode: null,
          title: dds.tema,
          status: dds.status,
          availabilityStatus: 'not_emitted',
          relevantDate: dds.updated_at,
          message:
            'DDS já publicado sem PDF final governado. O artefato oficial ainda não está disponível.',
          action: this.buildAction('Abrir DDS', 'dds', dds.id),
        }),
      ),
      ...checklists.map((checklist) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'checklist',
          companyId: checklist.company_id,
          siteId: checklist.site_id || null,
          documentId: checklist.id,
          documentCode: null,
          title: checklist.titulo,
          status: checklist.status,
          availabilityStatus: 'not_emitted',
          relevantDate: checklist.updated_at,
          message:
            'Checklist executado sem PDF final governado. O documento oficial ainda não foi emitido.',
          action: this.buildAction(
            'Abrir checklist',
            'checklist',
            checklist.id,
          ),
        }),
      ),
      ...rdos.map((rdo) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'rdo',
          companyId: rdo.company_id,
          siteId: rdo.site_id || null,
          documentId: rdo.id,
          documentCode: rdo.numero,
          title: `RDO ${rdo.numero}`,
          status: rdo.status,
          availabilityStatus: 'not_emitted',
          relevantDate: rdo.updated_at,
          message:
            'RDO aprovado sem PDF final governado. O fechamento documental ainda está pendente.',
          action: this.buildAction('Abrir RDO', 'rdo', rdo.id),
        }),
      ),
      ...cats.map((cat) =>
        this.createPendencyItem({
          type: 'missing_final_pdf',
          module: 'cat',
          companyId: cat.company_id,
          siteId: cat.site_id || null,
          documentId: cat.id,
          documentCode: cat.numero,
          title: `CAT ${cat.numero}`,
          status: cat.status,
          availabilityStatus: 'not_emitted',
          relevantDate: cat.closed_at || cat.updated_at,
          message:
            'CAT encerrada sem PDF final governado. O documento oficial ainda não foi emitido.',
          action: this.buildAction('Abrir CAT', 'cat', cat.id),
        }),
      ),
    ];
  }

  private async collectMissingSignaturePendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    if (filters.module && !MISSING_SIGNATURE_MODULES.has(filters.module)) {
      return [];
    }

    const [aprs, pts, ddsItems, checklists, rdos] = await Promise.all([
      this.aprsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: In([AprStatus.PENDENTE, AprStatus.APROVADA]),
          pdf_file_key: IsNull(),
        },
        relations: ['participants'],
      }),
      this.ptsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          status: In([PtStatus.PENDENTE, PtStatus.APROVADA]),
          pdf_file_key: IsNull(),
        },
        relations: ['executantes'],
      }),
      this.ddsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: In([DdsStatus.PUBLICADO, DdsStatus.AUDITADO]),
          pdf_file_key: IsNull(),
        },
        relations: ['participants'],
      }),
      this.checklistsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
          is_modelo: false,
          status: Not('Pendente'),
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'titulo',
          'status',
          'updated_at',
        ],
      }),
      this.rdosRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          status: In(['enviado', 'aprovado']),
          pdf_file_key: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'status',
          'assinatura_responsavel',
          'assinatura_engenheiro',
          'updated_at',
        ],
      }),
    ]);

    const signatureGroups = await this.loadSignatureGroups({
      companyId,
      aprIds: aprs.map((item) => item.id),
      ptIds: pts.map((item) => item.id),
      ddsIds: ddsItems.map((item) => item.id),
      checklistIds: checklists.map((item) => item.id),
    });

    const items: DashboardDocumentPendencyItem[] = [];

    for (const apr of aprs) {
      const requiredUsers = this.extractRequiredUserIds(apr.participants);
      if (requiredUsers.length === 0) {
        continue;
      }
      const signedUsers = signatureGroups.apr.get(apr.id) || new Set<string>();
      const missingCount = requiredUsers.filter(
        (userId) => !signedUsers.has(userId),
      ).length;
      if (missingCount <= 0) {
        continue;
      }
      items.push(
        this.createPendencyItem({
          type: 'missing_required_signature',
          module: 'apr',
          companyId: apr.company_id,
          siteId: apr.site_id,
          documentId: apr.id,
          documentCode: apr.numero,
          title: apr.titulo,
          status: apr.status,
          signatureStatus: `${requiredUsers.length - missingCount}/${requiredUsers.length} assinaturas concluídas`,
          availabilityStatus: 'pending_signatures',
          relevantDate: apr.aprovado_em || apr.updated_at,
          message:
            missingCount === 1
              ? 'APR aguardando 1 assinatura obrigatória para concluir o ciclo documental.'
              : `APR aguardando ${missingCount} assinaturas obrigatórias para concluir o ciclo documental.`,
          action: this.buildAction('Abrir APR', 'apr', apr.id),
          metadata: {
            requiredSignatures: requiredUsers.length,
            missingSignatures: missingCount,
          },
        }),
      );
    }

    for (const pt of pts) {
      const requiredUsers = this.extractRequiredUserIds(pt.executantes);
      if (requiredUsers.length === 0) {
        continue;
      }
      const signedUsers = signatureGroups.pt.get(pt.id) || new Set<string>();
      const missingCount = requiredUsers.filter(
        (userId) => !signedUsers.has(userId),
      ).length;
      if (missingCount <= 0) {
        continue;
      }
      items.push(
        this.createPendencyItem({
          type: 'missing_required_signature',
          module: 'pt',
          companyId: pt.company_id,
          siteId: pt.site_id,
          documentId: pt.id,
          documentCode: pt.numero,
          title: pt.titulo,
          status: pt.status,
          signatureStatus: `${requiredUsers.length - missingCount}/${requiredUsers.length} assinaturas concluídas`,
          availabilityStatus: 'pending_signatures',
          relevantDate: pt.aprovado_em || pt.updated_at,
          message:
            missingCount === 1
              ? 'PT aguardando 1 assinatura obrigatória para emissão oficial.'
              : `PT aguardando ${missingCount} assinaturas obrigatórias para emissão oficial.`,
          action: this.buildAction('Abrir PT', 'pt', pt.id),
          metadata: {
            requiredSignatures: requiredUsers.length,
            missingSignatures: missingCount,
          },
        }),
      );
    }

    for (const dds of ddsItems) {
      const requiredUsers = this.extractRequiredUserIds(dds.participants);
      if (requiredUsers.length === 0) {
        continue;
      }
      const signedUsers = signatureGroups.dds.get(dds.id) || new Set<string>();
      const missingCount = requiredUsers.filter(
        (userId) => !signedUsers.has(userId),
      ).length;
      if (missingCount <= 0) {
        continue;
      }
      items.push(
        this.createPendencyItem({
          type: 'missing_required_signature',
          module: 'dds',
          companyId: dds.company_id,
          siteId: dds.site_id,
          documentId: dds.id,
          documentCode: null,
          title: dds.tema,
          status: dds.status,
          signatureStatus: `${requiredUsers.length - missingCount}/${requiredUsers.length} assinaturas concluídas`,
          availabilityStatus: 'pending_signatures',
          relevantDate: dds.updated_at,
          message:
            missingCount === 1
              ? 'DDS aguardando 1 assinatura obrigatória para fechar o documento.'
              : `DDS aguardando ${missingCount} assinaturas obrigatórias para fechar o documento.`,
          action: this.buildAction('Abrir DDS', 'dds', dds.id),
          metadata: {
            requiredSignatures: requiredUsers.length,
            missingSignatures: missingCount,
          },
        }),
      );
    }

    for (const checklist of checklists) {
      const signatureCount = signatureGroups.checklist.get(checklist.id) || 0;
      if (signatureCount > 0) {
        continue;
      }
      items.push(
        this.createPendencyItem({
          type: 'missing_required_signature',
          module: 'checklist',
          companyId: checklist.company_id,
          siteId: checklist.site_id || null,
          documentId: checklist.id,
          documentCode: null,
          title: checklist.titulo,
          status: checklist.status,
          signatureStatus: '0 assinaturas registradas',
          availabilityStatus: 'pending_signatures',
          relevantDate: checklist.updated_at,
          message:
            'Checklist executado sem assinatura registrada. O fechamento documental permanece pendente.',
          action: this.buildAction(
            'Abrir checklist',
            'checklist',
            checklist.id,
          ),
        }),
      );
    }

    for (const rdo of rdos) {
      const missingFields = [
        !rdo.assinatura_responsavel ? 'responsável' : null,
        !rdo.assinatura_engenheiro ? 'engenheiro' : null,
      ].filter(Boolean) as string[];
      if (missingFields.length === 0) {
        continue;
      }
      items.push(
        this.createPendencyItem({
          type: 'missing_required_signature',
          module: 'rdo',
          companyId: rdo.company_id,
          siteId: rdo.site_id || null,
          documentId: rdo.id,
          documentCode: rdo.numero,
          title: `RDO ${rdo.numero}`,
          status: rdo.status,
          signatureStatus: `Faltando assinatura de ${missingFields.join(' e ')}`,
          availabilityStatus: 'pending_signatures',
          relevantDate: rdo.updated_at,
          message:
            'RDO sem todas as assinaturas operacionais obrigatórias para fechamento oficial.',
          action: this.buildAction('Abrir RDO', 'rdo', rdo.id),
          metadata: {
            missingFields: missingFields.join(', '),
          },
        }),
      );
    }

    return items;
  }

  private async collectDegradedDocumentAvailabilityPendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    if (
      filters.module &&
      !ALLOWED_DOCUMENT_AVAILABILITY_MODULES.has(filters.module)
    ) {
      return [];
    }

    const registryEntries = await this.documentRegistryRepository.find({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        ...(filters.module ? { module: filters.module } : {}),
        document_type: 'pdf',
      },
      order: {
        created_at: 'DESC',
      },
    });

    if (registryEntries.length === 0) {
      return [];
    }

    const metadataMap = await this.loadDocumentMetadata(
      registryEntries.map((entry) => ({
        module: entry.module,
        documentId: entry.entity_id,
      })),
    );

    const items = await this.mapWithConcurrency(
      registryEntries,
      5,
      async (entry) => {
        const available = await this.isStorageObjectAvailable({
          provider: 'document',
          storageKey: entry.file_key,
          resolver: () => this.documentStorageService.getSignedUrl(entry.file_key),
        });
        if (available) {
          return null;
        }

        const metadata =
          metadataMap.get(
            this.buildMetadataMapKey(entry.module, entry.entity_id),
          ) || null;

        return this.createPendencyItem({
          type: 'degraded_document_availability',
          module: entry.module,
          companyId: metadata?.companyId || entry.company_id,
          siteId: metadata?.siteId || null,
          documentId: entry.entity_id,
          documentCode: entry.document_code || metadata?.documentCode || null,
          title: entry.title || metadata?.title || null,
          status: metadata?.status || 'emitido',
          availabilityStatus: 'registered_without_signed_url',
          relevantDate: entry.document_date || entry.created_at,
          message:
            'Documento oficial emitido, mas a URL segura do storage está indisponível no momento.',
          action: this.buildAction(
            'Abrir documento',
            entry.module,
            entry.entity_id,
          ),
          metadata: {
            registryEntryId: entry.id,
            fileKey: entry.file_key,
            publicDocumentCode: entry.document_code || null,
          },
        });
      },
    );

    return items.filter((item): item is DashboardDocumentPendencyItem =>
      Boolean(item),
    );
  }

  private async collectFailedImportPendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    const imports = await this.documentImportsRepository.find({
      where: {
        ...(companyId ? { empresaId: companyId } : {}),
        status: In([
          DocumentImportStatus.FAILED,
          DocumentImportStatus.DEAD_LETTER,
        ]),
      },
      order: {
        updatedAt: 'DESC',
      },
    });

    return imports
      .map((record) => {
        const mappedModule = this.mapImportModule(record.tipoDocumento);
        return this.createPendencyItem({
          type: 'failed_import',
          module: mappedModule,
          companyId: record.empresaId,
          siteId: null,
          documentId: record.id,
          documentCode: record.nomeArquivo,
          title: record.nomeArquivo,
          status: record.status,
          documentStatus: record.status,
          availabilityStatus: record.status.toLowerCase(),
          relevantDate:
            record.deadLetteredAt ||
            record.lastAttemptAt ||
            record.updatedAt ||
            record.createdAt,
          message:
            record.mensagemErro ||
            (record.status === DocumentImportStatus.DEAD_LETTER
              ? 'Importação falhou definitivamente e foi direcionada à fila de exceção.'
              : 'Importação falhou e requer nova intervenção operacional.'),
          action: {
            label: 'Abrir importação documental',
            href: '/dashboard/documentos/importar',
          },
          metadata: {
            importId: record.id,
            idempotencyKey: record.idempotencyKey,
            attempts: record.processingAttempts,
            deadLettered: record.status === DocumentImportStatus.DEAD_LETTER,
          },
        });
      })
      .filter((item) => {
        if (!filters.module) {
          return true;
        }
        return item.module === filters.module;
      });
  }

  private async collectUnavailableGovernedVideoPendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    if (filters.module && !VIDEO_MODULES.has(filters.module)) {
      return [];
    }

    const attachments = await this.documentVideosRepository.find({
      where: {
        ...(companyId ? { company_id: companyId } : {}),
        ...(filters.module ? { module: filters.module as never } : {}),
        removed_at: IsNull(),
      },
      order: {
        uploaded_at: 'DESC',
      },
    });

    if (attachments.length === 0) {
      return [];
    }

    const metadataMap = await this.loadDocumentMetadata(
      attachments.map((attachment) => ({
        module: attachment.module,
        documentId: attachment.document_id,
      })),
    );

    const items = await this.mapWithConcurrency(
      attachments,
      5,
      async (attachment) => {
        let unavailable =
          attachment.availability === 'registered_without_signed_url';

        if (!unavailable) {
          const available = await this.isStorageObjectAvailable({
            provider: 'document',
            storageKey: attachment.storage_key,
            resolver: () =>
              this.documentStorageService.getSignedUrl(attachment.storage_key),
          });
          unavailable = !available;
        }

        if (!unavailable) {
          return null;
        }

        const metadata =
          metadataMap.get(
            this.buildMetadataMapKey(attachment.module, attachment.document_id),
          ) || null;

        return this.createPendencyItem({
          type: 'unavailable_governed_video',
          module: attachment.module,
          companyId: attachment.company_id,
          siteId: metadata?.siteId || null,
          documentId: attachment.document_id,
          documentCode: metadata?.documentCode || null,
          title: metadata?.title || attachment.original_name,
          status: metadata?.status || null,
          availabilityStatus: 'registered_without_signed_url',
          relevantDate: attachment.uploaded_at,
          message:
            'Vídeo governado anexado, mas indisponível no storage seguro para visualização.',
          action: this.buildAction(
            'Abrir documento',
            attachment.module,
            attachment.document_id,
          ),
          metadata: {
            attachmentId: attachment.id,
            storageKey: attachment.storage_key,
            originalName: attachment.original_name,
          },
        });
      },
    );

    return items.filter((item): item is DashboardDocumentPendencyItem =>
      Boolean(item),
    );
  }

  private async collectUnavailableGovernedAttachmentPendencies(
    filters: NormalizedDashboardDocumentPendenciesFilters,
    companyId?: string,
  ): Promise<DashboardDocumentPendencyItem[]> {
    if (filters.module && !ATTACHMENT_MODULES.has(filters.module)) {
      return [];
    }

    const [nonConformities, cats] = await Promise.all([
      this.nonConformitiesRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
          deleted_at: IsNull(),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'codigo_nc',
          'status',
          'anexos',
          'updated_at',
        ],
      }),
      this.catsRepository.find({
        where: {
          ...(companyId ? { company_id: companyId } : {}),
          ...(filters.siteId ? { site_id: filters.siteId } : {}),
        },
        select: [
          'id',
          'company_id',
          'site_id',
          'numero',
          'status',
          'attachments',
          'updated_at',
        ],
      }),
    ]);

    const ncItems = await this.mapWithConcurrency(
      nonConformities,
      4,
      async (nc) => {
        const governedAttachments = (nc.anexos || [])
          .map((value, index) => ({
            index,
            payload: this.parseNcGovernedAttachmentReference(value),
          }))
          .filter(
            (
              item,
            ): item is {
              index: number;
              payload: NcGovernedAttachmentReferencePayload;
            } => Boolean(item.payload),
          );

        const itemResults = await Promise.all(
          governedAttachments.map(async ({ index, payload }) => {
            const available = await this.isStorageObjectAvailable({
              provider: 'document',
              storageKey: payload.fileKey,
              resolver: () => this.documentStorageService.getSignedUrl(payload.fileKey),
            });
            if (available) {
              return null;
            }

            return this.createPendencyItem({
              type: 'unavailable_governed_attachment',
              module: 'nonconformity',
              companyId: nc.company_id,
              siteId: nc.site_id || null,
              documentId: nc.id,
              documentCode: nc.codigo_nc,
              title: `NC ${nc.codigo_nc}`,
              status: nc.status,
              availabilityStatus: 'registered_without_signed_url',
              relevantDate: payload.uploadedAt || nc.updated_at,
              message:
                'Anexo governado da não conformidade está registrado, mas indisponível no storage seguro.',
              action: this.buildAction(
                'Abrir não conformidade',
                'nonconformity',
                nc.id,
              ),
              metadata: {
                attachmentIndex: index,
                fileKey: payload.fileKey,
                originalName: payload.originalName,
              },
            });
          }),
        );

        return itemResults.filter(
          (item): item is DashboardDocumentPendencyItem => Boolean(item),
        );
      },
    );

    const catItems = await this.mapWithConcurrency(cats, 4, async (cat) => {
      const attachments = Array.isArray(cat.attachments) ? cat.attachments : [];
      const itemResults = await Promise.all(
        attachments.map(async (attachment) => {
          const available = await this.isStorageObjectAvailable({
            provider: 'generic',
            storageKey: attachment.file_key,
            resolver: () =>
              this.storageService.getPresignedDownloadUrl(attachment.file_key),
          });
          if (available) {
            return null;
          }

          return this.createPendencyItem({
            type: 'unavailable_governed_attachment',
            module: 'cat',
            companyId: cat.company_id,
            siteId: cat.site_id || null,
            documentId: cat.id,
            documentCode: cat.numero,
            title: `CAT ${cat.numero}`,
            status: cat.status,
            availabilityStatus: 'registered_without_signed_url',
            relevantDate: attachment.uploaded_at || cat.updated_at || null,
            message:
              'Anexo governado da CAT está indisponível para acesso seguro no momento.',
            action: this.buildAction('Abrir CAT', 'cat', cat.id),
            metadata: {
              attachmentId: attachment.id,
              fileKey: attachment.file_key,
              originalName: attachment.file_name,
            },
          });
        }),
      );

      return itemResults.filter((item): item is DashboardDocumentPendencyItem =>
        Boolean(item),
      );
    });

    return [...ncItems.flat(), ...catItems.flat()];
  }

  private async loadSignatureGroups(input: {
    companyId?: string;
    aprIds: string[];
    ptIds: string[];
    ddsIds: string[];
    checklistIds: string[];
  }): Promise<{
    apr: Map<string, Set<string>>;
    pt: Map<string, Set<string>>;
    dds: Map<string, Set<string>>;
    checklist: Map<string, number>;
  }> {
    const where = [
      ...(input.aprIds.length
        ? [
            {
              ...(input.companyId ? { company_id: input.companyId } : {}),
              document_type: 'APR',
              document_id: In(input.aprIds),
            },
          ]
        : []),
      ...(input.ptIds.length
        ? [
            {
              ...(input.companyId ? { company_id: input.companyId } : {}),
              document_type: 'PT',
              document_id: In(input.ptIds),
            },
          ]
        : []),
      ...(input.ddsIds.length
        ? [
            {
              ...(input.companyId ? { company_id: input.companyId } : {}),
              document_type: 'DDS',
              document_id: In(input.ddsIds),
            },
          ]
        : []),
      ...(input.checklistIds.length
        ? [
            {
              ...(input.companyId ? { company_id: input.companyId } : {}),
              document_type: 'CHECKLIST',
              document_id: In(input.checklistIds),
            },
          ]
        : []),
    ];

    if (where.length === 0) {
      return {
        apr: new Map(),
        pt: new Map(),
        dds: new Map(),
        checklist: new Map(),
      };
    }

    const signatures = await this.signaturesRepository.find({
      where,
      select: ['document_id', 'document_type', 'user_id'],
    });

    const apr = new Map<string, Set<string>>();
    const pt = new Map<string, Set<string>>();
    const dds = new Map<string, Set<string>>();
    const checklist = new Map<string, number>();

    for (const signature of signatures) {
      if (signature.document_type === 'CHECKLIST') {
        checklist.set(
          signature.document_id,
          (checklist.get(signature.document_id) || 0) + 1,
        );
        continue;
      }

      const targetMap =
        signature.document_type === 'APR'
          ? apr
          : signature.document_type === 'PT'
            ? pt
            : dds;
      const current = targetMap.get(signature.document_id) || new Set<string>();
      current.add(signature.user_id);
      targetMap.set(signature.document_id, current);
    }

    return { apr, pt, dds, checklist };
  }

  private extractRequiredUserIds(
    users?: Array<{ id?: string | null }> | null,
  ): string[] {
    return Array.from(
      new Set(
        (users || [])
          .map((user) => user?.id?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private async loadDocumentMetadata(
    entries: Array<{ module: string; documentId: string }>,
  ): Promise<Map<string, LightweightDocumentMetadata>> {
    const groupedIds = entries.reduce<Map<string, Set<string>>>(
      (accumulator, entry) => {
        if (!entry.module || !entry.documentId) {
          return accumulator;
        }
        const current = accumulator.get(entry.module) || new Set<string>();
        current.add(entry.documentId);
        accumulator.set(entry.module, current);
        return accumulator;
      },
      new Map<string, Set<string>>(),
    );

    const metadata = new Map<string, LightweightDocumentMetadata>();

    const assignMany = <T extends { id: string }>(
      module: string,
      rows: T[],
      project: (row: T) => LightweightDocumentMetadata,
    ) => {
      for (const row of rows) {
        metadata.set(this.buildMetadataMapKey(module, row.id), project(row));
      }
    };

    const aprIds = Array.from(groupedIds.get('apr') || []);
    if (aprIds.length > 0) {
      assignMany(
        'apr',
        await this.aprsRepository.find({
          where: { id: In(aprIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'numero', 'titulo'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id,
          status: row.status,
          documentCode: row.numero,
          title: row.titulo,
        }),
      );
    }

    const ptIds = Array.from(groupedIds.get('pt') || []);
    if (ptIds.length > 0) {
      assignMany(
        'pt',
        await this.ptsRepository.find({
          where: { id: In(ptIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'numero', 'titulo'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id,
          status: row.status,
          documentCode: row.numero,
          title: row.titulo,
        }),
      );
    }

    const ddsIds = Array.from(groupedIds.get('dds') || []);
    if (ddsIds.length > 0) {
      assignMany(
        'dds',
        await this.ddsRepository.find({
          where: { id: In(ddsIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'tema'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id,
          status: row.status,
          documentCode: null,
          title: row.tema,
        }),
      );
    }

    const checklistIds = Array.from(groupedIds.get('checklist') || []);
    if (checklistIds.length > 0) {
      assignMany(
        'checklist',
        await this.checklistsRepository.find({
          where: { id: In(checklistIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'titulo'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id || null,
          status: row.status,
          documentCode: null,
          title: row.titulo,
        }),
      );
    }

    const inspectionIds = Array.from(groupedIds.get('inspection') || []);
    if (inspectionIds.length > 0) {
      assignMany(
        'inspection',
        await this.inspectionsRepository.find({
          where: { id: In(inspectionIds) },
          select: ['id', 'company_id', 'site_id', 'setor_area'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id,
          status: 'emitido',
          documentCode: null,
          title: row.setor_area,
        }),
      );
    }

    const rdoIds = Array.from(groupedIds.get('rdo') || []);
    if (rdoIds.length > 0) {
      assignMany(
        'rdo',
        await this.rdosRepository.find({
          where: { id: In(rdoIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'numero'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id || null,
          status: row.status,
          documentCode: row.numero,
          title: `RDO ${row.numero}`,
        }),
      );
    }

    const catIds = Array.from(groupedIds.get('cat') || []);
    if (catIds.length > 0) {
      assignMany(
        'cat',
        await this.catsRepository.find({
          where: { id: In(catIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'numero'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id || null,
          status: row.status,
          documentCode: row.numero,
          title: `CAT ${row.numero}`,
        }),
      );
    }

    const auditIds = Array.from(groupedIds.get('audit') || []);
    if (auditIds.length > 0) {
      assignMany(
        'audit',
        await this.auditsRepository.find({
          where: { id: In(auditIds) },
          select: ['id', 'company_id', 'site_id', 'titulo'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id,
          status: 'emitido',
          documentCode: null,
          title: row.titulo,
        }),
      );
    }

    const ncIds = Array.from(groupedIds.get('nonconformity') || []);
    if (ncIds.length > 0) {
      assignMany(
        'nonconformity',
        await this.nonConformitiesRepository.find({
          where: { id: In(ncIds) },
          select: ['id', 'company_id', 'site_id', 'status', 'codigo_nc'],
        }),
        (row) => ({
          companyId: row.company_id,
          siteId: row.site_id || null,
          status: row.status,
          documentCode: row.codigo_nc,
          title: `NC ${row.codigo_nc}`,
        }),
      );
    }

    return metadata;
  }

  private buildMetadataMapKey(module: string, documentId: string): string {
    return `${module}:${documentId}`;
  }

  private createPendencyItem(input: {
    type: DocumentPendencyType;
    module: string;
    companyId: string;
    siteId?: string | null;
    documentId?: string | null;
    documentCode?: string | null;
    title?: string | null;
    status?: string | null;
    documentStatus?: string | null;
    signatureStatus?: string | null;
    availabilityStatus?: string | null;
    relevantDate?: Date | string | null;
    message: string;
    action?: DocumentPendencyAction | null;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }): DashboardDocumentPendencyItem {
    const criticality = resolveDocumentPendencyCriticality({
      type: input.type,
      module: input.module,
      status: input.status,
      availabilityStatus: input.availabilityStatus,
    });
    const normalizedDate = input.relevantDate
      ? new Date(input.relevantDate).toISOString()
      : null;

    return {
      id: [
        input.type,
        input.module,
        input.documentId || input.documentCode || 'unknown',
        input.metadata?.attachmentId ||
          input.metadata?.attachmentIndex ||
          input.metadata?.registryEntryId ||
          input.metadata?.importId ||
          null,
      ]
        .filter(Boolean)
        .join(':'),
      type: input.type,
      typeLabel: getDocumentPendencyTypeLabel(input.type),
      module: input.module,
      moduleLabel: getDocumentModuleLabel(input.module),
      companyId: input.companyId,
      companyName: null,
      siteId: input.siteId || null,
      siteName: null,
      documentId: input.documentId || null,
      documentCode: input.documentCode || null,
      title: input.title || null,
      status: input.status || null,
      documentStatus: input.documentStatus || input.status || null,
      signatureStatus: input.signatureStatus || null,
      availabilityStatus: input.availabilityStatus || null,
      criticality,
      priority: criticality,
      relevantDate: normalizedDate,
      message: input.message,
      action: input.action || null,
      allowedActions: [],
      suggestedRoute: input.action?.href || null,
      suggestedRouteParams:
        input.documentId || input.siteId
          ? {
              documentId: input.documentId || null,
              siteId: input.siteId || null,
              module: input.module,
            }
          : null,
      publicValidationUrl: null,
      retryAllowed: false,
      replacementDocumentId: null,
      replacementRoute: null,
      metadata: Object.fromEntries(
        Object.entries(input.metadata || {}).map(([key, value]) => [
          key,
          value ?? null,
        ]),
      ),
    };
  }

  private canViewPendencyItem(
    item: DashboardDocumentPendencyItem,
    permissions: Set<string>,
  ): boolean {
    const requiredPermission = this.resolveRequiredPermission(item);
    if (!requiredPermission) {
      return false;
    }
    return permissions.has(requiredPermission);
  }

  private resolveRequiredPermission(
    item: Pick<DashboardDocumentPendencyItem, 'type' | 'module'>,
  ): string | null {
    if (item.type === 'failed_import') {
      return (
        DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS['document-import'] || null
      );
    }

    return DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS[item.module] || null;
  }

  private attachOperationalContext(input: {
    item: DashboardDocumentPendencyItem;
    permissions: Set<string>;
    aprReplacementTargets: Map<string, AprReplacementTarget>;
  }): DashboardDocumentPendencyItem {
    const replacementTarget =
      input.item.module === 'apr' && input.item.documentId
        ? input.aprReplacementTargets.get(input.item.documentId) || null
        : null;
    const publicDocumentCode =
      typeof input.item.metadata.publicDocumentCode === 'string'
        ? input.item.metadata.publicDocumentCode
        : null;
    const publicValidationUrl = publicDocumentCode
      ? this.buildPublicValidationUrl(publicDocumentCode)
      : null;
    const retryAllowed =
      input.item.type === 'failed_import' &&
      input.item.status === DocumentImportStatus.DEAD_LETTER &&
      input.permissions.has(
        DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS['document-import'],
      );

    const allowedActions = this.buildAllowedActions({
      item: input.item,
      publicValidationUrl,
      retryAllowed,
      replacementTarget,
    });

    return {
      ...input.item,
      action:
        input.item.action ||
        this.buildPrimaryRouteAction(allowedActions) ||
        null,
      allowedActions,
      suggestedRoute:
        input.item.action?.href ||
        this.buildPrimaryRouteAction(allowedActions)?.href ||
        null,
      publicValidationUrl,
      retryAllowed,
      replacementDocumentId: replacementTarget?.documentId || null,
      replacementRoute: replacementTarget?.href || null,
    };
  }

  private buildAllowedActions(input: {
    item: DashboardDocumentPendencyItem;
    publicValidationUrl: string | null;
    retryAllowed: boolean;
    replacementTarget: AprReplacementTarget | null;
  }): DashboardDocumentPendencyAllowedAction[] {
    const actions: DashboardDocumentPendencyAllowedAction[] = [];
    const routeHref =
      input.item.action?.href ||
      (input.item.documentId
        ? this.resolveModuleHref(input.item.module, input.item.documentId)
        : null);

    if (routeHref) {
      actions.push({
        key: 'open_document',
        label: input.item.action?.label || 'Abrir documento',
        kind: 'route',
        enabled: true,
        href: routeHref,
      });
    }

    switch (input.item.type) {
      case 'missing_final_pdf':
        actions.push({
          key: 'open_final_pdf',
          label: 'Abrir PDF final',
          kind: 'resolve',
          enabled: false,
          reason:
            'O PDF final governado ainda não foi emitido para este documento.',
        });
        break;
      case 'degraded_document_availability':
        actions.push({
          key: 'open_final_pdf',
          label: 'Tentar abrir PDF final',
          kind: 'resolve',
          enabled: Boolean(input.item.documentId),
          reason: input.item.documentId
            ? null
            : 'Documento sem identificador válido para resolver o PDF final.',
        });
        break;
      case 'unavailable_governed_video':
        actions.push({
          key: 'open_governed_video',
          label: 'Tentar abrir vídeo oficial',
          kind: 'resolve',
          enabled: Boolean(
            input.item.documentId && input.item.metadata.attachmentId,
          ),
          reason:
            input.item.documentId && input.item.metadata.attachmentId
              ? null
              : 'Metadados insuficientes para localizar o vídeo governado.',
        });
        break;
      case 'unavailable_governed_attachment':
        actions.push({
          key: 'open_governed_attachment',
          label: 'Tentar abrir anexo oficial',
          kind: 'resolve',
          enabled: Boolean(
            input.item.documentId &&
            (input.item.metadata.attachmentId ||
              typeof input.item.metadata.attachmentIndex === 'number'),
          ),
          reason:
            input.item.documentId &&
            (input.item.metadata.attachmentId ||
              typeof input.item.metadata.attachmentIndex === 'number')
              ? null
              : 'Metadados insuficientes para localizar o anexo governado.',
        });
        break;
      case 'failed_import':
        actions.push({
          key: 'retry_import',
          label: 'Reenfileirar importação',
          kind: 'mutation',
          enabled: input.retryAllowed,
          reason: input.retryAllowed
            ? null
            : 'Somente importações em dead-letter podem ser reenfileiradas com segurança.',
        });
        break;
      default:
        break;
    }

    if (input.publicValidationUrl) {
      actions.push({
        key: 'open_public_validation',
        label: 'Validar documento',
        kind: 'route',
        enabled: true,
        href: input.publicValidationUrl,
      });
    }

    if (input.replacementTarget) {
      actions.push({
        key: 'open_replacement_document',
        label: 'Ir para nova versão',
        kind: 'route',
        enabled: true,
        href: input.replacementTarget.href,
      });
    }

    return actions;
  }

  private buildPrimaryRouteAction(
    actions: DashboardDocumentPendencyAllowedAction[],
  ): DocumentPendencyAction | null {
    const candidate = actions.find(
      (action) => action.kind === 'route' && action.enabled && action.href,
    );
    if (!candidate?.href) {
      return null;
    }

    return {
      label: candidate.label,
      href: candidate.href,
    };
  }

  private buildPublicValidationUrl(code: string): string {
    return `/verify?code=${encodeURIComponent(code)}`;
  }

  private async buildAprReplacementTargets(
    items: DashboardDocumentPendencyItem[],
  ): Promise<Map<string, AprReplacementTarget>> {
    const aprIds = Array.from(
      new Set(
        items
          .filter((item) => item.module === 'apr' && item.documentId)
          .map((item) => item.documentId as string),
      ),
    );
    if (aprIds.length === 0) {
      return new Map();
    }

    const currentAprs = await this.aprsRepository.find({
      where: {
        id: In(aprIds),
        deleted_at: IsNull(),
      },
      select: ['id', 'parent_apr_id', 'versao'],
    });
    if (currentAprs.length === 0) {
      return new Map();
    }

    const rootIds = Array.from(
      new Set(currentAprs.map((item) => item.parent_apr_id || item.id)),
    );
    const relatedAprs = await this.aprsRepository.find({
      where: [
        {
          id: In(rootIds),
          deleted_at: IsNull(),
        },
        {
          parent_apr_id: In(rootIds),
          deleted_at: IsNull(),
        },
      ],
      select: ['id', 'parent_apr_id', 'versao'],
    });

    const latestByRoot = new Map<string, { id: string; versao: number }>();
    for (const apr of relatedAprs) {
      const rootId = apr.parent_apr_id || apr.id;
      const current = latestByRoot.get(rootId);
      const currentVersion = apr.versao ?? 1;
      if (!current || currentVersion > current.versao) {
        latestByRoot.set(rootId, {
          id: apr.id,
          versao: currentVersion,
        });
      }
    }

    const result = new Map<string, AprReplacementTarget>();
    for (const currentApr of currentAprs) {
      const rootId = currentApr.parent_apr_id || currentApr.id;
      const latest = latestByRoot.get(rootId);
      if (!latest || latest.id === currentApr.id) {
        continue;
      }

      const href = this.resolveModuleHref('apr', latest.id);
      if (!href) {
        continue;
      }

      result.set(currentApr.id, {
        documentId: latest.id,
        href,
      });
    }

    return result;
  }

  private applyFilters(
    items: DashboardDocumentPendencyItem[],
    filters: NormalizedDashboardDocumentPendenciesFilters,
  ): DashboardDocumentPendencyItem[] {
    return items.filter((item) => {
      if (filters.companyId && item.companyId !== filters.companyId) {
        return false;
      }
      if (filters.siteId && item.siteId !== filters.siteId) {
        return false;
      }
      if (filters.module && item.module !== filters.module) {
        return false;
      }
      if (filters.criticality && item.criticality !== filters.criticality) {
        return false;
      }
      if (filters.status && !this.matchesStatus(item.status, filters.status)) {
        return false;
      }
      if (!this.isWithinDateRange(item.relevantDate, filters)) {
        return false;
      }
      return true;
    });
  }

  private buildSummary(items: DashboardDocumentPendencyItem[]) {
    const byCriticality: Record<DocumentPendencyCriticality, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const byTypeMap = new Map<DocumentPendencyType, number>();
    const byModuleMap = new Map<string, number>();

    for (const item of items) {
      byCriticality[item.criticality] += 1;
      byTypeMap.set(item.type, (byTypeMap.get(item.type) || 0) + 1);
      byModuleMap.set(item.module, (byModuleMap.get(item.module) || 0) + 1);
    }

    return {
      total: items.length,
      byCriticality,
      byType: Array.from(byTypeMap.entries())
        .map(([type, total]) => ({
          type,
          label: getDocumentPendencyTypeLabel(type),
          total,
        }))
        .sort((left, right) => right.total - left.total),
      byModule: Array.from(byModuleMap.entries())
        .map(([module, total]) => ({
          module,
          label: getDocumentModuleLabel(module),
          total,
        }))
        .sort((left, right) => right.total - left.total),
    };
  }

  private buildAction(
    label: string,
    module: string,
    documentId: string,
  ): DocumentPendencyAction | null {
    const href = this.resolveModuleHref(module, documentId);
    if (!href) {
      return null;
    }
    return { label, href };
  }

  private resolveModuleHref(module: string, documentId: string): string | null {
    switch (module) {
      case 'apr':
        return `/dashboard/aprs/edit/${documentId}`;
      case 'pt':
        return `/dashboard/pts/edit/${documentId}`;
      case 'dds':
        return `/dashboard/dds/edit/${documentId}`;
      case 'checklist':
        return `/dashboard/checklists/edit/${documentId}`;
      case 'inspection':
        return `/dashboard/inspections/edit/${documentId}`;
      case 'nonconformity':
        return `/dashboard/nonconformities/edit/${documentId}`;
      case 'audit':
        return `/dashboard/audits/edit/${documentId}`;
      case 'cat':
        return '/dashboard/cats';
      case 'rdo':
        return '/dashboard/rdos';
      default:
        return null;
    }
  }

  private matchesStatus(
    itemStatus: string | null,
    expectedStatus: string,
  ): boolean {
    if (!itemStatus) {
      return false;
    }
    return (
      itemStatus.trim().toLowerCase() === expectedStatus.trim().toLowerCase()
    );
  }

  private isWithinDateRange(
    relevantDate: string | null,
    filters: Pick<
      NormalizedDashboardDocumentPendenciesFilters,
      'dateFrom' | 'dateTo'
    >,
  ): boolean {
    if (!filters.dateFrom && !filters.dateTo) {
      return true;
    }
    if (!relevantDate) {
      return false;
    }
    const time = new Date(relevantDate).getTime();
    if (Number.isNaN(time)) {
      return false;
    }
    if (filters.dateFrom && time < filters.dateFrom.getTime()) {
      return false;
    }
    if (filters.dateTo && time > filters.dateTo.getTime()) {
      return false;
    }
    return true;
  }

  private normalizeStringFilter(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeCriticality(
    value?: string,
  ): DocumentPendencyCriticality | undefined {
    const normalized = this.normalizeStringFilter(value)?.toLowerCase();
    if (!normalized) {
      return undefined;
    }

    if (
      normalized === 'critical' ||
      normalized === 'high' ||
      normalized === 'medium' ||
      normalized === 'low'
    ) {
      return normalized;
    }

    return undefined;
  }

  private parseDate(
    value: string | undefined,
    boundary: 'start' | 'end',
  ): Date | undefined {
    const normalized = this.normalizeStringFilter(value);
    if (!normalized) {
      return undefined;
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }

    if (boundary === 'start') {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }

  private async buildCompaniesMap(
    items: DashboardDocumentPendencyItem[],
  ): Promise<Map<string, string>> {
    const companyIds = Array.from(new Set(items.map((item) => item.companyId)));
    if (companyIds.length === 0) {
      return new Map();
    }
    const companies = await this.companiesRepository.find({
      where: { id: In(companyIds) },
      select: ['id', 'razao_social'],
    });
    return new Map(
      companies.map((company) => [company.id, company.razao_social]),
    );
  }

  private async buildSitesMap(
    items: DashboardDocumentPendencyItem[],
  ): Promise<Map<string, string>> {
    const siteIds = Array.from(
      new Set(
        items
          .map((item) => item.siteId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (siteIds.length === 0) {
      return new Map();
    }
    const sites = await this.sitesRepository.find({
      where: { id: In(siteIds) },
      select: ['id', 'nome'],
    });
    return new Map(sites.map((site) => [site.id, site.nome]));
  }

  private parseNcGovernedAttachmentReference(
    value?: string | null,
  ): NcGovernedAttachmentReferencePayload | null {
    if (!value?.startsWith(NC_GOVERNED_ATTACHMENT_PREFIX)) {
      return null;
    }

    try {
      const decoded = Buffer.from(
        value.slice(NC_GOVERNED_ATTACHMENT_PREFIX.length),
        'base64url',
      ).toString('utf8');
      const payload = JSON.parse(
        decoded,
      ) as NcGovernedAttachmentReferencePayload;
      if (
        payload?.kind !== 'governed-storage' ||
        typeof payload.fileKey !== 'string' ||
        typeof payload.originalName !== 'string' ||
        typeof payload.mimeType !== 'string'
      ) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private mapImportModule(tipoDocumento?: string | null): string {
    const normalized = (tipoDocumento || '').trim().toUpperCase();
    switch (normalized) {
      case 'APR':
        return 'apr';
      case 'PT':
        return 'pt';
      case 'DDS':
        return 'dds';
      case 'CHECKLIST':
        return 'checklist';
      case 'RDO':
        return 'rdo';
      case 'INSPECTION':
      case 'INSPECAO':
      case 'INSPEÇÃO':
        return 'inspection';
      case 'CAT':
        return 'cat';
      case 'NONCONFORMITY':
      case 'NAO_CONFORMIDADE':
      case 'NÃO_CONFORMIDADE':
        return 'nonconformity';
      case 'AUDIT':
      case 'AUDITORIA':
        return 'audit';
      default:
        return 'document-import';
    }
  }

  private async mapWithConcurrency<TInput, TOutput>(
    items: TInput[],
    concurrency: number,
    mapper: (item: TInput) => Promise<TOutput>,
  ): Promise<TOutput[]> {
    if (items.length === 0) {
      return [];
    }

    const results: TOutput[] = [];
    let currentIndex = 0;

    const workers = Array.from({
      length: Math.min(concurrency, items.length),
    }).map(async () => {
      while (currentIndex < items.length) {
        const targetIndex = currentIndex++;
        results[targetIndex] = await mapper(items[targetIndex]);
      }
    });

    await Promise.all(workers);
    return results;
  }
}
