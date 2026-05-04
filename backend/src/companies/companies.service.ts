import {
  Injectable,
  NotFoundException,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, QueryFailedError } from 'typeorm';
import { plainToClass } from 'class-transformer';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Company } from './entities/company.entity';
import { CompanyResponseDto } from './dto/company-response.dto';
import { CnpjUtil } from '../common/utils/cnpj.util';
import { User } from '../users/entities/user.entity';
import { UserIdentityType } from '../users/constants/user-identity.constant';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { profileStage } from '../common/observability/perf-stage.util';
import { escapeLikePattern } from '../common/utils/sql.util';
import { StorageService } from '../common/services/storage.service';
import { Site } from '../sites/entities/site.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Dds, DdsStatus } from '../dds/entities/dds.entity';
import { DDS_THEME_LIBRARY } from '../dds/templates/dds-theme-library';

type ParsedDataUrl = {
  contentType: string;
  buffer: Buffer;
  sha256: string;
  extension: string;
};

const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;

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
  ) {}

  async create(
    createCompanyDto: DeepPartial<Company>,
  ): Promise<CompanyResponseDto> {
    const cnpj = createCompanyDto.cnpj
      ? CnpjUtil.normalize(createCompanyDto.cnpj)
      : undefined;

    const parsedLogo = this.parseLogoDataUrl(createCompanyDto.logo_url);
    const company = this.companiesRepository.create({
      ...createCompanyDto,
      cnpj,
      logo_url: parsedLogo ? null : createCompanyDto.logo_url,
    });
    let saved = await this.companiesRepository.save(company);
    if (parsedLogo) {
      await this.persistCompanyLogo(saved, parsedLogo);
      saved = await this.companiesRepository.save(saved);
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
      throw new Error('Nenhum perfil encontrado para criar usuário sistema.');
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

  /** Retorna apenas os IDs das empresas ativas — para uso interno em cron jobs. */
  async findAllActive(): Promise<{ id: string }[]> {
    const cacheKey = 'companies:active:ids';
    const cached = await this.cacheManager.get<{ id: string }[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const companies = await this.companiesRepository.find({
      select: ['id'],
      where: { status: true },
    });
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
        'company.created_at',
        'company.updated_at',
      ])
      .orderBy('company.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${escapeLikePattern(opts.search.trim())}%`;
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

    const companies = await this.companiesRepository.find();
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
    const parsedLogo = this.parseLogoDataUrl(updateCompanyDto.logo_url);
    const nextValues = { ...updateCompanyDto };

    if (parsedLogo) {
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
    const company = await this.findOneEntity(id);
    const linkedUsers = await this.companiesRepository.manager
      .getRepository(User)
      .count({ where: { company_id: id } });

    if (linkedUsers > 0) {
      throw new BadRequestException(
        'Não é possível excluir a empresa enquanto existir usuário vinculado. Desative ou mova os usuários antes de excluir.',
      );
    }

    try {
      await this.companiesRepository.remove(company);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driverError = (
          error as QueryFailedError & { driverError?: unknown }
        ).driverError as { code?: string } | undefined;
        if (driverError?.code === '23503') {
          throw new BadRequestException(
            'Não é possível excluir a empresa porque existem registros vinculados a ela.',
          );
        }
      }
      throw error;
    }

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

    const match = value.match(/^data:([^;,]+);base64,(.+)$/i);
    if (!match) {
      throw new BadRequestException('Logo inline inválida.');
    }

    const contentType = match[1].toLowerCase();
    if (!contentType.startsWith('image/')) {
      throw new BadRequestException('Logo deve ser uma imagem.');
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > COMPANY_LOGO_MAX_BYTES) {
      throw new BadRequestException('Logo deve ter no máximo 2MB.');
    }

    return {
      contentType,
      buffer,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      extension: this.resolveLogoExtension(contentType),
    };
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
      case 'image/svg+xml':
        return 'svg';
      default:
        return 'bin';
    }
  }
}
