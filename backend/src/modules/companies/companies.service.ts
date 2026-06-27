import {
  Injectable,
  NotFoundException,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { plainToClass } from 'class-transformer';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Company } from './entities/company.entity';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CnpjUtil } from '../../shared/utils/cnpj.util';
import { User } from '../users/entities/user.entity';
import { UserIdentityType } from '../users/constants/user-identity.constant';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../../shared/utils/offset-pagination.util';
import { profileStage } from '../../shared/observability/perf-stage.util';
import { escapeLikePattern } from '../../shared/utils/sql.util';
import { normalizeOptionalSearchQuery } from '../../shared/utils/query-normalization.util';
import { StorageService } from '../../shared/services/storage.service';
import { Site } from '../sites/entities/site.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Dds, DdsStatus } from '../dds/entities/dds.entity';
import { DDS_THEME_LIBRARY } from '../dds/templates/dds-theme-library';
import { detectMimeFromMagicBytes } from '../../shared/utils/detect-mime.util';
import { FileInspectionService } from '../../shared/security/file-inspection.service';
import { GDPRDeletionService } from '../admin/services/gdpr-deletion.service';
import { TenantService } from '../../shared/tenant/tenant.service';

type ParsedDataUrl = {
  contentType: string;
  buffer: Buffer;
  sha256: string;
  extension: string;
};

const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const COMPANY_LOGO_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const isInlineDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^data:/i.test(value.trim());

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private companiesRepository: Repository<Company>,
    @InjectRepository(Site)
    private sitesRepository: Repository<Site>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly storageService: StorageService,
    private readonly gdprDeletionService: GDPRDeletionService,
    private readonly fileInspectionService: FileInspectionService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Executa um callback em contexto super-admin global (RLS bypass).
   *
   * Operações inerentemente cross-tenant (enumeração/atualização de empresas
   * por crons/schedulers) rodam SEM contexto de tenant. Como a tabela
   * `companies` tem RLS `id = current_company() OR is_super_admin()`, sem este
   * wrap a RLS filtraria tudo e os jobs (retenção, expiry, SLA, expiração de
   * trial) seriam enfileirados/atualizados com 0 linhas — silenciosamente.
   */
  private runAsGlobalSuperAdmin<T>(callback: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      this.tenantService.run(
        { companyId: undefined, isSuperAdmin: true, siteScope: 'all' },
        callback,
      ),
    );
  }

  async create(
    createCompanyDto: DeepPartial<Company>,
  ): Promise<CompanyResponseDto> {
    const cnpj = createCompanyDto.cnpj
      ? CnpjUtil.normalize(createCompanyDto.cnpj)
      : undefined;

    if (cnpj) {
      const existing = await this.companiesRepository.findOne({
        where: { cnpj },
        select: ['id'],
        withDeleted: true,
      });
      if (existing) {
        throw new ConflictException('CNPJ já cadastrado no sistema.');
      }
    }

    const parsedLogo = this.parseLogoDataUrl(createCompanyDto.logo_url);

    if (parsedLogo) {
      await this.scanLogoBuffer(parsedLogo.buffer, parsedLogo.extension);
    }

    // Pré-gerar o UUID da empresa para calcular o storage key definitivo
    // antes da persistência no banco, evitando dois saves.
    const companyId = randomUUID();
    let logoStorageKey: string | null = null;

    if (parsedLogo) {
      logoStorageKey = `companies/${companyId}/logo-${parsedLogo.sha256.slice(0, 16)}.${parsedLogo.extension}`;
      await this.storageService.uploadFile(
        logoStorageKey,
        parsedLogo.buffer,
        parsedLogo.contentType,
      );
    }

    let saved: Company;
    try {
      const company = this.companiesRepository.create({
        ...createCompanyDto,
        id: companyId,
        cnpj,
        logo_url: null,
        logo_storage_key: logoStorageKey,
        logo_content_type: parsedLogo?.contentType ?? null,
        logo_sha256: parsedLogo?.sha256 ?? null,
      });
      saved = await this.companiesRepository.save(company);
    } catch (error) {
      if (logoStorageKey) {
        void this.storageService
          .deleteFile(logoStorageKey)
          .catch((deleteErr: unknown) => {
            this.logger.warn({
              event: 'company_logo_cleanup_failed',
              key: logoStorageKey,
              error:
                deleteErr instanceof Error
                  ? deleteErr.message
                  : String(deleteErr),
            });
          });
      }
      throw error;
    }

    try {
      await this.ensureDefaultDdsThemeLibrary(saved.id);
    } catch (error) {
      this.logger.warn({
        event: 'dds_theme_library_seed_failed',
        companyId: saved.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    return this.toResponseDto(saved);
  }

  async ensureDefaultDdsThemeLibrary(companyId: string): Promise<void> {
    const existingRows = await this.ddsRepository.find({
      select: ['tema'],
      where: { company_id: companyId, is_modelo: true },
    });
    const existingTemaSet = new Set(
      existingRows
        .map((row) => row.tema?.trim())
        .filter((value): value is string => Boolean(value)),
    );

    let site = await this.sitesRepository.findOne({
      where: { company_id: companyId },
      order: { created_at: 'ASC' },
    });
    if (!site) {
      site = await this.sitesRepository.save(
        this.sitesRepository.create({
          company_id: companyId,
          nome: 'Geral',
          local: 'Geral',
          status: true,
        }),
      );
    }

    let facilitator = await this.usersRepository.findOne({
      where: { company_id: companyId },
      order: { created_at: 'ASC' },
    });
    if (!facilitator) {
      facilitator = await this.createSystemFacilitatorUser(companyId, site.id);
    }

    const now = new Date();
    const entities = DDS_THEME_LIBRARY.filter(
      (theme) => !existingTemaSet.has(theme.tema.trim()),
    ).map((theme) =>
      this.ddsRepository.create({
        tema: theme.tema,
        conteudo: theme.conteudo,
        data: now,
        is_modelo: true,
        company_id: companyId,
        site_id: site.id,
        facilitador_id: facilitator.id,
        status: DdsStatus.RASCUNHO,
        version: 1,
      }),
    );

    if (entities.length === 0) {
      return;
    }

    const batchSize = 50;
    for (let i = 0; i < entities.length; i += batchSize) {
      await this.ddsRepository.save(entities.slice(i, i + batchSize));
    }

    this.logger.log({
      event: 'dds_theme_library_seeded',
      companyId,
      templatesInserted: entities.length,
    });
  }

  private async createSystemFacilitatorUser(
    companyId: string,
    siteId: string,
  ): Promise<User> {
    const preferredProfileNames = [
      'Técnico',
      'Supervisor',
      'Administrador da Empresa',
    ];
    let profile = await this.profilesRepository
      .createQueryBuilder('profile')
      .where('profile.status = true')
      .andWhere('profile.nome IN (:...names)', { names: preferredProfileNames })
      .orderBy('profile.created_at', 'ASC')
      .getOne();

    if (!profile) {
      profile = await this.profilesRepository.findOne({
        where: { status: true },
        order: { created_at: 'ASC' },
      });
    }

    if (!profile) {
      throw new InternalServerErrorException(
        'Nenhum perfil encontrado para criar usuário sistema.',
      );
    }

    const user = this.usersRepository.create({
      nome: 'SGS (Temas DDS)',
      email: `system.dds.${companyId}@sgs.local`,
      cpf: null,
      funcao: 'Sistema',
      company_id: companyId,
      site_id: siteId,
      profile_id: profile.id,
      identity_type: UserIdentityType.SYSTEM_USER,
      status: true,
      ai_processing_consent: false,
    });

    return this.usersRepository.save(user);
  }

  /** Marca como trial_expired todos os trials expirados. Retorna a quantidade atualizada. */
  async markExpiredTrials(): Promise<number> {
    const result = await this.runAsGlobalSuperAdmin(() =>
      this.companiesRepository
        .createQueryBuilder()
        .update(Company)
        .set({ account_status: 'trial_expired' as const })
        .where('account_status = :status', { status: 'trialing' })
        .andWhere('trial_ends_at IS NOT NULL')
        .andWhere('trial_ends_at < :now', { now: new Date() })
        .execute(),
    );

    if ((result.affected ?? 0) > 0) {
      await this.cacheManager.del('companies:all');
      await this.cacheManager.del('companies:active:ids');
    }

    return result.affected ?? 0;
  }

  /** Retorna empresas em trial expirando em exatamente `daysAhead` dias (janela de 24h). */
  async findTrialsExpiringIn(
    daysAhead: number,
  ): Promise<
    Pick<Company, 'id' | 'razao_social' | 'email_contato' | 'trial_ends_at'>[]
  > {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() + (daysAhead - 1) * 24 * 60 * 60 * 1000,
    );
    const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    return this.runAsGlobalSuperAdmin(() =>
      this.companiesRepository
        .createQueryBuilder('company')
        .select([
          'company.id',
          'company.razao_social',
          'company.email_contato',
          'company.trial_ends_at',
        ])
        .where('company.account_status = :status', { status: 'trialing' })
        .andWhere('company.status = true')
        .andWhere('company.trial_ends_at >= :windowStart', { windowStart })
        .andWhere('company.trial_ends_at < :windowEnd', { windowEnd })
        .getMany(),
    );
  }

  /** Ativa uma empresa (trialing/trial_expired/suspended → active). */
  async activateTenant(companyId: string): Promise<CompanyResponseDto> {
    const company = await this.findOneEntity(companyId);

    if (company.account_status === 'cancelled') {
      throw new BadRequestException(
        'Empresas canceladas não podem ser ativadas.',
      );
    }

    const previousStatus = company.account_status;

    company.account_status = 'active';
    company.activated_at = new Date();
    company.suspended_at = null;
    company.suspension_reason = null;

    const saved = await this.companiesRepository.save(company);

    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${companyId}`);

    this.logger.log({
      event: 'tenant_activated',
      companyId,
      previousStatus,
    });

    return this.toResponseDto(saved);
  }

  /** Estende o trial de uma empresa (trialing ou trial_expired). */
  async extendTrial(
    companyId: string,
    extraDays: number,
  ): Promise<CompanyResponseDto> {
    const company = await this.findOneEntity(companyId);

    if (
      company.account_status !== 'trialing' &&
      company.account_status !== 'trial_expired'
    ) {
      throw new BadRequestException(
        'Extensão de trial só é possível para empresas em trial ou com trial expirado.',
      );
    }

    const now = new Date();
    const base =
      company.trial_ends_at && company.trial_ends_at > now
        ? company.trial_ends_at
        : now;

    company.trial_ends_at = new Date(
      base.getTime() + extraDays * 24 * 60 * 60 * 1000,
    );
    company.account_status = 'trialing';

    const saved = await this.companiesRepository.save(company);

    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${companyId}`);

    this.logger.log({
      event: 'trial_extended',
      companyId,
      extraDays,
      newTrialEndsAt: saved.trial_ends_at,
    });

    return this.toResponseDto(saved);
  }

  /** Retorna apenas os IDs das empresas ativas — para uso interno em cron jobs. */
  async findAllActive(): Promise<{ id: string }[]> {
    const cacheKey = 'companies:active:ids';
    const cached = await this.cacheManager.get<{ id: string }[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const companies = await this.runAsGlobalSuperAdmin(() =>
      this.companiesRepository.find({
        select: ['id'],
        where: { status: true },
      }),
    );
    await this.cacheManager.set(cacheKey, companies, 60 * 60 * 1000);
    return companies;
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<OffsetPage<CompanyResponseDto>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.companiesRepository
      .createQueryBuilder('company')
      .select([
        'company.id',
        'company.razao_social',
        'company.cnpj',
        'company.endereco',
        'company.responsavel',
        'company.email_contato',
        // Deliberately omit logo_url in paginated list to avoid returning
        // multi-megabyte base64 payloads and degrading list latency.
        'company.status',
        'company.account_status',
        'company.trial_started_at',
        'company.trial_ends_at',
        'company.activated_at',
        'company.suspended_at',
        'company.suspension_reason',
        'company.created_at',
        'company.updated_at',
      ])
      .orderBy('company.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const searchTerm = normalizeOptionalSearchQuery(opts?.search);
    if (searchTerm) {
      const search = `%${escapeLikePattern(searchTerm)}%`;
      query.where(
        `(
          company.razao_social ILIKE :search ESCAPE '\\'
          OR company.cnpj ILIKE :search ESCAPE '\\'
          OR COALESCE(company.responsavel, '') ILIKE :search ESCAPE '\\'
        )`,
        { search },
      );
    }

    const [companies, total] = await profileStage({
      logger: this.logger,
      route: '/companies',
      stage: 'db_get_many_and_count',
      run: () => query.getManyAndCount(),
    });
    const data = await profileStage({
      logger: this.logger,
      route: '/companies',
      stage: 'serialize_page',
      run: () =>
        companies.map((company) => plainToClass(CompanyResponseDto, company)),
    });

    return toOffsetPage(data, total, page, limit);
  }

  async findAll(): Promise<CompanyResponseDto[]> {
    const cached =
      await this.cacheManager.get<CompanyResponseDto[]>('companies:all');
    if (cached) {
      return cached;
    }

    const companies = await this.companiesRepository.find({ take: 1000 });

    if (companies.length >= 1000) {
      this.logger.warn({
        event: 'companies_findall_limit_reached',
        count: companies.length,
      });
    }

    const result = await Promise.all(
      companies.map((company) => this.toResponseDto(company)),
    );

    if (!companies.some((company) => company.logo_storage_key)) {
      // Cache por 12 horas apenas quando não há URL assinada de logo.
      await this.cacheManager.set('companies:all', result, 12 * 60 * 60 * 1000);
    }

    return result;
  }

  async findOne(id: string): Promise<CompanyResponseDto> {
    const cached = await this.cacheManager.get<CompanyResponseDto>(
      `company:${id}`,
    );
    if (cached) {
      return cached;
    }

    const company = await this.findOneEntity(id);
    const result = await this.toResponseDto(company);

    if (!company.logo_storage_key) {
      // Cache por 1 hora apenas quando não há URL assinada de logo.
      await this.cacheManager.set(`company:${id}`, result, 60 * 60 * 1000);
    }

    return result;
  }

  async findOneEntity(id: string): Promise<Company> {
    const company = await this.companiesRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Empresa com ID ${id} não encontrada`);
    }
    return company;
  }

  async update(
    id: string,
    updateCompanyDto: DeepPartial<Company>,
  ): Promise<CompanyResponseDto> {
    const company = await this.findOneEntity(id);

    if (updateCompanyDto.cnpj) {
      const normalizedCnpj = CnpjUtil.normalize(updateCompanyDto.cnpj);
      const existing = await this.companiesRepository.findOne({
        where: { cnpj: normalizedCnpj },
        select: ['id'],
        withDeleted: true,
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('CNPJ já cadastrado para outra empresa.');
      }
    }

    const parsedLogo = this.parseLogoDataUrl(updateCompanyDto.logo_url);
    const nextValues = { ...updateCompanyDto };

    if (parsedLogo) {
      await this.scanLogoBuffer(parsedLogo.buffer, parsedLogo.extension);
      nextValues.logo_url = null;
      await this.persistCompanyLogo(company, parsedLogo);
    } else if (Object.prototype.hasOwnProperty.call(nextValues, 'logo_url')) {
      const nextLogoUrl = nextValues.logo_url;
      if (nextLogoUrl === null || nextLogoUrl === '') {
        nextValues.logo_url = null;
        company.logo_storage_key = null;
        company.logo_content_type = null;
        company.logo_sha256 = null;
      } else if (isInlineDataUrl(nextLogoUrl)) {
        throw new BadRequestException('Logo inline inválida.');
      } else {
        company.logo_storage_key = null;
        company.logo_content_type = null;
        company.logo_sha256 = null;
      }
    }

    Object.assign(company, nextValues);
    const saved = await this.companiesRepository.save(company);

    // Invalidar caches
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${id}`);

    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<void> {
    await this.findOneEntity(id); // lança NotFoundException se empresa não existir
    const linkedUsers = await this.companiesRepository.manager
      .getRepository(User)
      .count({ where: { company_id: id } });

    if (linkedUsers > 0) {
      throw new BadRequestException(
        'Não é possível excluir a empresa enquanto existir usuário vinculado. Desative ou mova os usuários antes de excluir.',
      );
    }

    const gdprResult = await this.gdprDeletionService.deleteCompanyData(id);
    if (gdprResult.status === 'failed') {
      this.logger.error({
        event: 'company_gdpr_delete_failed',
        companyId: id,
        gdprResult,
      });
      throw new InternalServerErrorException(
        'Falha ao processar exclusão de dados vinculados à empresa.',
      );
    }

    await this.companiesRepository.softDelete(id);

    // Invalidar caches
    await this.cacheManager.del('companies:all');
    await this.cacheManager.del('companies:active:ids');
    await this.cacheManager.del(`company:${id}`);
  }

  private async toResponseDto(company: Company): Promise<CompanyResponseDto> {
    const dto = plainToClass(CompanyResponseDto, company);
    if (!company.logo_storage_key) {
      return dto;
    }

    try {
      dto.logo_url = await this.storageService.getPresignedInlineViewUrl(
        company.logo_storage_key,
      );
    } catch (error) {
      this.logger.warn({
        event: 'company_logo_presign_failed',
        companyId: company.id,
        key: company.logo_storage_key,
        error: error instanceof Error ? error.message : String(error),
      });
      dto.logo_url = null;
    }

    return dto;
  }

  private parseLogoDataUrl(value: unknown): ParsedDataUrl | null {
    if (!isInlineDataUrl(value)) {
      return null;
    }

    // Reject strings that are provably too large before running regex on a multi-MB string,
    // which can throw RangeError in V8 for large inputs.
    // Max valid base64 for 2 MB ≈ ceil(2MB * 4/3) + header overhead.
    const MAX_DATA_URL_CHARS =
      Math.ceil(COMPANY_LOGO_MAX_BYTES * (4 / 3)) + 100;
    if (value.length > MAX_DATA_URL_CHARS) {
      throw new BadRequestException('Logo deve ter no máximo 2MB.');
    }

    const match = value.match(/^data:[^;,]+;base64,(.+)$/i);
    if (!match) {
      throw new BadRequestException('Logo inline inválida.');
    }

    const buffer = Buffer.from(match[1], 'base64');
    if (buffer.length === 0 || buffer.length > COMPANY_LOGO_MAX_BYTES) {
      throw new BadRequestException('Logo deve ter no máximo 2MB.');
    }

    const detectedMime = detectMimeFromMagicBytes(buffer.subarray(0, 12));
    if (
      !detectedMime ||
      !COMPANY_LOGO_ALLOWED_CONTENT_TYPES.has(detectedMime)
    ) {
      throw new BadRequestException('Logo deve ser PNG, JPG ou WebP.');
    }

    return {
      contentType: detectedMime,
      buffer,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      extension: this.resolveLogoExtension(detectedMime),
    };
  }

  private async scanLogoBuffer(
    buffer: Buffer,
    extension: string,
  ): Promise<void> {
    const inspection = await this.fileInspectionService.inspect(
      buffer,
      `logo.${extension}`,
    );
    if (!inspection.clean) {
      throw new UnprocessableEntityException(
        `Logo rejeitada: ameaça detectada${inspection.threat ? ` (${inspection.threat})` : ''}.`,
      );
    }
  }

  private async persistCompanyLogo(
    company: Company,
    logo: ParsedDataUrl,
  ): Promise<void> {
    const key = `companies/${company.id}/logo-${logo.sha256.slice(0, 16)}.${logo.extension}`;
    await this.storageService.uploadFile(key, logo.buffer, logo.contentType);
    company.logo_url = null;
    company.logo_storage_key = key;
    company.logo_content_type = logo.contentType;
    company.logo_sha256 = logo.sha256;
  }

  private resolveLogoExtension(contentType: string): string {
    switch (contentType) {
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }
}
