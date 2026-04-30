import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomBytes, pbkdf2Sync, createHmac, randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { User } from './entities/user.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { PasswordService } from '../common/services/password.service';
import { CpfUtil } from '../common/utils/cpf.util';
import { USER_WITH_PASSWORD_FIELDS } from './constants/user-fields.constant';
import { UserResponseDto } from './dto/user-response.dto';
import { ExportMyDataResponseDto } from './dto/export-my-data-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RequestContext } from '../common/middleware/request-context.middleware';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { Profile } from '../profiles/entities/profile.entity';
import { Site } from '../sites/entities/site.entity';
import { Role } from '../auth/enums/roles.enum';
import { RbacService } from '../rbac/rbac.service';
import { AuthRedisService } from '../common/redis/redis.service';
import { SupabaseAuthAdminService } from '../auth/supabase-auth-admin.service';
import { escapeLikePattern } from '../common/utils/sql.util';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  hashSensitiveValue,
} from '../common/security/field-encryption.util';
import {
  UserAccessStatus,
  UserIdentityType,
} from './constants/user-identity.constant';

type ExportConsentRow = {
  type: string;
  version_label: string;
  body_hash: string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  migrated_from_legacy: boolean;
  created_at: Date | string;
};

type ExportCountRow = {
  count: string | number | bigint;
};

type ExportProcessingArea = {
  area: string;
  description: string;
  count: number;
  likelyLegalBasis: string;
  sensitivity: string;
};

type ExportCountQuery = Omit<ExportProcessingArea, 'count'> & {
  sql: string;
  params: string[];
};

type GdprErasureCoverageRow = {
  table_name: string;
  deleted_count: string | number | bigint;
};

const DATA_PORTABILITY_LIMITATIONS = [
  {
    area: 'documentos_sst',
    reason:
      'Documentos de SST podem conter dados de terceiros, dados empresariais e obrigações legais do Cliente controlador; a entrega integral exige validação operacional antes da liberação.',
  },
  {
    area: 'arquivos_e_backups',
    reason:
      'Arquivos em storage e backups não são anexados automaticamente nesta exportação; devem ser tratados por fluxo de requisição autenticada e validação de retenção legal.',
  },
  {
    area: 'logs_de_seguranca',
    reason:
      'Logs podem conter dados de outros usuários, segredos operacionais e evidências de segurança; a exportação automática retorna inventário, não payload bruto.',
  },
] as const;

const ROLE_ADMIN_EMPRESA = Role.ADMIN_EMPRESA as string;
const ROLE_TST = Role.TST as string;
const ROLE_SUPERVISOR = Role.SUPERVISOR as string;
const ROLE_COLABORADOR = Role.COLABORADOR as string;
const ROLE_TRABALHADOR = Role.TRABALHADOR as string;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private tenantService: TenantService,
    private passwordService: PasswordService,
    private auditService: AuditService,
    private rbacService: RbacService,
    private redisService: AuthRedisService,
    @Optional()
    private readonly supabaseAuthAdminService: SupabaseAuthAdminService | null = null,
  ) {}

  private getTenantIdOrThrow(message?: string): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        message ||
          'Contexto de empresa não identificado para operação de usuários.',
      );
    }
    return tenantId;
  }

  private buildCpfSecurityPayload(cpf?: string | null): {
    cpf: string | null;
    cpf_hash: string | null;
    cpf_ciphertext: string | null;
  } {
    if (!cpf) {
      return { cpf: null, cpf_hash: null, cpf_ciphertext: null };
    }

    const normalizedCpf = CpfUtil.normalize(cpf);
    return {
      // Novo write path: não persiste CPF em texto plano.
      cpf: null,
      cpf_hash: hashSensitiveValue(normalizedCpf),
      cpf_ciphertext: encryptSensitiveValue(normalizedCpf),
    };
  }

  private resolveUserCpf(input: {
    cpf?: string | null;
    cpf_ciphertext?: string | null;
  }): string | null {
    if (input.cpf_ciphertext) {
      return decryptSensitiveValue(input.cpf_ciphertext);
    }
    return input.cpf ?? null;
  }

  private toIsoStringOrNull(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private toCount(value: string | number | bigint | undefined): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private hasCredential(input: {
    password?: string | null;
    authUserId?: string | null;
  }): boolean {
    return Boolean(
      (typeof input.password === 'string' && input.password.trim()) ||
      (typeof input.authUserId === 'string' && input.authUserId.trim()),
    );
  }

  private normalizeIdentityType(value: unknown): UserIdentityType | undefined {
    return value === UserIdentityType.SYSTEM_USER ||
      value === UserIdentityType.EMPLOYEE_SIGNER
      ? value
      : undefined;
  }

  private resolveIdentityType(input: {
    requested?: unknown;
    current?: UserIdentityType | null;
    password?: string | null;
    authUserId?: string | null;
    email?: string | null;
  }): UserIdentityType {
    const requested = this.normalizeIdentityType(input.requested);
    if (requested) {
      return requested;
    }

    if (input.current) {
      return input.current;
    }

    if (
      this.hasCredential(input) ||
      (typeof input.email === 'string' && input.email.trim())
    ) {
      return UserIdentityType.SYSTEM_USER;
    }

    return UserIdentityType.EMPLOYEE_SIGNER;
  }

  private resolveAccessStatus(input: {
    identityType: UserIdentityType;
    password?: string | null;
    authUserId?: string | null;
    email?: string | null;
  }): UserAccessStatus {
    if (this.hasCredential(input)) {
      return UserAccessStatus.CREDENTIALED;
    }

    if (input.identityType === UserIdentityType.EMPLOYEE_SIGNER) {
      return UserAccessStatus.NO_LOGIN;
    }

    return UserAccessStatus.MISSING_CREDENTIALS;
  }

  private assertIdentityCredentialContract(input: {
    identityType: UserIdentityType;
    password?: string | null;
    authUserId?: string | null;
  }): void {
    if (
      input.identityType === UserIdentityType.EMPLOYEE_SIGNER &&
      this.hasCredential(input)
    ) {
      throw new BadRequestException(
        'Funcionário/signatário sem login não pode manter credenciais de acesso. Use um fluxo dedicado para remover credenciais antes de alterar a classificação.',
      );
    }
  }

  private async countDataPortabilityRows(
    sql: string,
    params: string[],
  ): Promise<number> {
    const rows = await this.usersRepository.manager.query<ExportCountRow[]>(
      sql,
      params,
    );
    return this.toCount(rows[0]?.count);
  }

  private async getConsentExportEvents(userId: string, tenantId: string) {
    const rows = await this.usersRepository.manager.query<ExportConsentRow[]>(
      `
        SELECT
          uc.type,
          cv.version_label,
          cv.body_hash,
          uc.accepted_at,
          uc.revoked_at,
          uc.migrated_from_legacy,
          uc.created_at
        FROM user_consents uc
        INNER JOIN consent_versions cv ON cv.id = uc.version_id
        WHERE uc.user_id = $1
          AND uc.company_id = $2
        ORDER BY uc.created_at DESC
      `,
      [userId, tenantId],
    );

    return rows.map((row) => ({
      type: row.type,
      versionLabel: row.version_label,
      bodyHash: row.body_hash,
      acceptedAt: this.toIsoStringOrNull(row.accepted_at),
      revokedAt: this.toIsoStringOrNull(row.revoked_at),
      migratedFromLegacy: Boolean(row.migrated_from_legacy),
      recordedAt:
        this.toIsoStringOrNull(row.created_at) || new Date(0).toISOString(),
    }));
  }

  private buildDataPortabilityCountQueries(
    userId: string,
    tenantId: string,
  ): ExportCountQuery[] {
    return [
      {
        area: 'medical_exams',
        description: 'Exames médicos ocupacionais vinculados ao titular.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'sensivel_saude_ocupacional',
        sql: 'SELECT COUNT(*)::int AS count FROM medical_exams WHERE user_id = $1 AND company_id = $2',
        params: [userId, tenantId],
      },
      {
        area: 'trainings',
        description: 'Treinamentos e capacitações vinculados ao titular.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'ocupacional',
        sql: 'SELECT COUNT(*)::int AS count FROM trainings WHERE user_id = $1 AND company_id = $2',
        params: [userId, tenantId],
      },
      {
        area: 'epi_assignments',
        description: 'Fichas e entregas de EPI relacionadas ao titular.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'ocupacional',
        sql: `
          SELECT COUNT(*)::int AS count
          FROM epi_assignments
          WHERE company_id = $2
            AND (user_id = $1 OR signer_user_id = $1 OR created_by_id = $1)
        `,
        params: [userId, tenantId],
      },
      {
        area: 'cats',
        description: 'Comunicações de acidente vinculadas ao titular.',
        likelyLegalBasis: 'obrigacao_legal',
        sensitivity: 'sensivel_saude_ocupacional',
        sql: 'SELECT COUNT(*)::int AS count FROM cats WHERE worker_id = $1 AND company_id = $2',
        params: [userId, tenantId],
      },
      {
        area: 'signatures',
        description:
          'Assinaturas digitais/eletrônicas realizadas pelo titular.',
        likelyLegalBasis: 'execucao_contrato_ou_obrigacao_legal',
        sensitivity: 'identificador_assinatura',
        sql: 'SELECT COUNT(*)::int AS count FROM signatures WHERE user_id = $1 AND company_id = $2',
        params: [userId, tenantId],
      },
      {
        area: 'ai_interactions',
        description: 'Interações de IA associadas ao titular.',
        likelyLegalBasis: 'consentimento_ou_execucao_contrato',
        sensitivity: 'potencialmente_sensivel',
        sql: 'SELECT COUNT(*)::int AS count FROM ai_interactions WHERE user_id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        params: [userId, tenantId],
      },
      {
        area: 'document_registry',
        description:
          'Documentos governados criados ou registrados pelo titular.',
        likelyLegalBasis: 'execucao_contrato_ou_obrigacao_legal',
        sensitivity: 'documental_ocupacional',
        sql: 'SELECT COUNT(*)::int AS count FROM document_registry WHERE created_by_id = $1 AND company_id = $2 AND deleted_at IS NULL',
        params: [userId, tenantId],
      },
      {
        area: 'apr_participation',
        description:
          'APRs em que o titular consta como participante ou aprovador.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'ocupacional',
        sql: `
          SELECT COUNT(DISTINCT apr.id)::int AS count
          FROM aprs apr
          LEFT JOIN apr_participants participant ON participant.apr_id = apr.id
          WHERE apr.company_id = $2
            AND (apr.aprovado_por_id = $1 OR participant.user_id = $1)
        `,
        params: [userId, tenantId],
      },
      {
        area: 'pt_participation',
        description:
          'PTs em que o titular consta como responsável, executante ou aprovador.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'ocupacional',
        sql: `
          SELECT COUNT(DISTINCT pt.id)::int AS count
          FROM pts pt
          LEFT JOIN pt_executantes executante ON executante.pt_id = pt.id
          WHERE pt.company_id = $2
            AND (
              pt.responsavel_id = $1
              OR pt.aprovado_por_id = $1
              OR executante.user_id = $1
            )
        `,
        params: [userId, tenantId],
      },
      {
        area: 'dds_participation',
        description:
          'DDSs em que o titular consta como participante ou emissor.',
        likelyLegalBasis: 'obrigacao_legal_ou_execucao_contrato',
        sensitivity: 'ocupacional',
        sql: `
          SELECT COUNT(DISTINCT dds.id)::int AS count
          FROM dds dds
          LEFT JOIN dds_participants participant ON participant.dds_id = dds.id
          WHERE dds.company_id = $2
            AND (dds.emitted_by_user_id = $1 OR participant.user_id = $1)
        `,
        params: [userId, tenantId],
      },
      {
        area: 'audit_and_security_logs',
        description:
          'Logs de auditoria, segurança e rastreabilidade associados ao titular.',
        likelyLegalBasis: 'legitimo_interesse_ou_obrigacao_legal',
        sensitivity: 'seguranca_operacional',
        sql: `
          SELECT (
            (SELECT COUNT(*) FROM audit_logs WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL) +
            (SELECT COUNT(*) FROM forensic_trail_events WHERE user_id = $1 AND company_id = $2)
          )::int AS count
        `,
        params: [userId, tenantId],
      },
      {
        area: 'mail_logs',
        description:
          'Registros de e-mails transacionais associados ao titular.',
        likelyLegalBasis: 'execucao_contrato_ou_legitimo_interesse',
        sensitivity: 'contato_comunicacao',
        sql: 'SELECT COUNT(*)::int AS count FROM mail_logs WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL',
        params: [userId, tenantId],
      },
      {
        area: 'activities',
        description: 'Atividades operacionais associadas ao titular.',
        likelyLegalBasis: 'execucao_contrato',
        sensitivity: 'operacional',
        sql: 'SELECT COUNT(*)::int AS count FROM activities WHERE user_id = $1 AND company_id = $2 AND deleted_at IS NULL',
        params: [userId, tenantId],
      },
    ];
  }

  private async buildDataPortabilitySummary(
    userId: string,
    tenantId: string,
  ): Promise<ExportProcessingArea[]> {
    const queries = this.buildDataPortabilityCountQueries(userId, tenantId);
    return Promise.all(
      queries.map(async (query) => ({
        area: query.area,
        description: query.description,
        likelyLegalBasis: query.likelyLegalBasis,
        sensitivity: query.sensitivity,
        count: await this.countDataPortabilityRows(query.sql, query.params),
      })),
    );
  }

  async create(createUserData: DeepPartial<User>): Promise<UserResponseDto> {
    const {
      password,
      identity_type: requestedIdentityType,
      access_status: _ignoredAccessStatus,
      ...rest
    } = createUserData;
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();

    // Defesa em profundidade: não confiar em company_id vindo do body.
    if (
      !isSuperAdmin &&
      rest.company_id &&
      tenantId &&
      rest.company_id !== tenantId
    ) {
      this.logger.warn({
        event: 'cross_tenant_attempt',
        action: 'users.create',
        actorId: RequestContext.getUserId(),
        tenantId,
        requestedCompanyId: rest.company_id,
      });
      throw new ForbiddenException(
        'Não é permitido criar usuário em outra empresa.',
      );
    }

    const companyId = isSuperAdmin ? rest.company_id || tenantId : tenantId;

    if (!companyId) {
      throw new BadRequestException('Empresa é obrigatória');
    }
    if (typeof rest.site_id === 'string' && rest.site_id) {
      await this.assertSiteBelongsToCompany(rest.site_id, companyId);
    }

    // Broken Function Level Auth / Privilege Escalation:
    // apenas ADMIN_GERAL pode atribuir perfil "Administrador Geral".
    let profileName: string | undefined;
    if (rest.profile_id) {
      const profile = await this.profilesRepository.findOne({
        where: { id: rest.profile_id },
        select: { id: true, nome: true },
      });
      profileName = profile?.nome;
      if (profile?.nome === Role.ADMIN_GERAL && !isSuperAdmin) {
        this.logger.warn({
          event: 'role_change_denied',
          action: 'users.create',
          actorId: RequestContext.getUserId(),
          targetCompanyId: companyId,
          requestedProfile: profile.nome,
        });
        throw new ForbiddenException(
          'Atribuição de perfil Administrador Geral não é permitida.',
        );
      }
      if (!isSuperAdmin && profile) {
        const actorUserId = RequestContext.getUserId();
        if (actorUserId) {
          await this.enforceRoleAssignmentPolicy(actorUserId, profile.nome);
        }
      }
    }
    const normalizedCpf = CpfUtil.normalize(rest.cpf as string);
    const cpfHash = hashSensitiveValue(normalizedCpf);

    const existingUser = await this.usersRepository.findOne({
      where: [{ cpf_hash: cpfHash }, { cpf: normalizedCpf }],
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('CPF já cadastrado');
    }

    let hashedPassword = '';
    if (password && typeof password === 'string') {
      hashedPassword = await this.passwordService.hash(password);
    }
    const userId =
      typeof createUserData.id === 'string' && createUserData.id
        ? createUserData.id
        : randomUUID();
    const requestedAuthUserId =
      typeof createUserData.auth_user_id === 'string'
        ? createUserData.auth_user_id
        : undefined;
    const identityType = this.resolveIdentityType({
      requested: requestedIdentityType,
      password: hashedPassword || undefined,
      authUserId: requestedAuthUserId,
      email: typeof rest.email === 'string' ? rest.email : undefined,
    });
    this.assertIdentityCredentialContract({
      identityType,
      password: hashedPassword || undefined,
      authUserId: requestedAuthUserId,
    });
    const authProvision: { authUserId?: string; created: boolean } =
      identityType === UserIdentityType.SYSTEM_USER
        ? await this.provisionSupabaseAuthForSnapshot({
            id: userId,
            email: typeof rest.email === 'string' ? rest.email : undefined,
            password: typeof password === 'string' ? password : undefined,
            company_id: companyId,
            cpf: normalizedCpf,
            profileName,
            auth_user_id: requestedAuthUserId,
            status: typeof rest.status === 'boolean' ? rest.status : true,
          })
        : { created: false };
    const effectiveAuthUserId = authProvision.authUserId || requestedAuthUserId;
    const accessStatus = this.resolveAccessStatus({
      identityType,
      password: hashedPassword || undefined,
      authUserId: effectiveAuthUserId,
      email: typeof rest.email === 'string' ? rest.email : undefined,
    });
    const cpfSecurityPayload = this.buildCpfSecurityPayload(normalizedCpf);
    const user = this.usersRepository.create({
      id: userId,
      ...rest,
      ...cpfSecurityPayload,
      company_id: companyId,
      auth_user_id: effectiveAuthUserId || undefined,
      identity_type: identityType,
      access_status: accessStatus,
      password: hashedPassword || undefined,
    } as DeepPartial<User>);
    let saved: User;
    try {
      saved = await this.usersRepository.save(user);
    } catch (error) {
      if (authProvision.created && authProvision.authUserId) {
        await this.supabaseAuthAdminService?.safeDeleteUser(
          authProvision.authUserId,
        );
      }
      throw error;
    }
    saved.cpf = this.resolveUserCpf(saved);
    await this.invalidateAuthSessionUserCache(saved.id);
    return plainToClass(UserResponseDto, saved);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    siteId?: string;
    identityType?: UserIdentityType;
    accessStatus?: UserAccessStatus;
  }): Promise<OffsetPage<UserResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const tenantContext = this.tenantService.getContext();
    const requestSiteId = RequestContext.getSiteId();
    const requestedSiteId = opts?.siteId?.trim() || undefined;
    const canUseRequestedSite =
      isSuperAdmin || tenantContext?.siteScope === 'all';
    const effectiveSiteId = canUseRequestedSite
      ? requestedSiteId
      : requestSiteId || undefined;
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.site', 'site')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.cpf_ciphertext')
      .addSelect('user.cpf_hash')
      .skip(skip)
      .take(limit)
      .orderBy('user.nome', 'ASC');

    if (tenantId) {
      qb.where('user.company_id = :tenantId', { tenantId });
    }

    if (effectiveSiteId) {
      qb.andWhere('(user.site_id = :siteId OR user.site_id IS NULL)', {
        siteId: effectiveSiteId,
      });
    }
    // No site filter: non-superadmin users without a site assignment see all
    // company users — tenant isolation is guaranteed by the company_id filter above.

    if (opts?.identityType) {
      qb.andWhere('user.identity_type = :identityType', {
        identityType: opts.identityType,
      });
    }

    if (opts?.accessStatus) {
      qb.andWhere('user.access_status = :accessStatus', {
        accessStatus: opts.accessStatus,
      });
    }

    const search = opts?.search?.trim();
    if (search) {
      const escapedSearch = `%${escapeLikePattern(search)}%`;
      const normalizedCpfSearch = search.replace(/\D/g, '');
      const hasCpfSearch = normalizedCpfSearch.length === 11;
      const cpfHashSearch = hasCpfSearch
        ? hashSensitiveValue(normalizedCpfSearch)
        : null;
      const clause = hasCpfSearch
        ? "(user.nome ILIKE :search ESCAPE '\\' OR user.cpf ILIKE :search ESCAPE '\\' OR user.cpf_hash = :cpfHashSearch)"
        : "(user.nome ILIKE :search ESCAPE '\\' OR user.cpf ILIKE :search ESCAPE '\\')";
      const hasBaseScope =
        Boolean(
          tenantId ||
          effectiveSiteId ||
          opts?.identityType ||
          opts?.accessStatus,
        ) || !isSuperAdmin;
      if (hasBaseScope) {
        qb.andWhere(clause, {
          search: escapedSearch,
          ...(cpfHashSearch ? { cpfHashSearch } : {}),
        });
      } else {
        qb.where(clause, {
          search: escapedSearch,
          ...(cpfHashSearch ? { cpfHashSearch } : {}),
        });
      }
    }

    const [users, total] = await qb.getManyAndCount();
    users.forEach((user) => {
      user.cpf = this.resolveUserCpf(user);
    });
    const data = users.map((user) => plainToClass(UserResponseDto, user));
    return toOffsetPage(data, total, page, limit);
  }

  async findAll(page = 1, limit = 20): Promise<OffsetPage<UserResponseDto>> {
    return this.findPaginated({ page, limit });
  }

  /**
   * Leitura leve para sessão autenticada.
   *
   * Evita joins de company/site no /auth/me para reduzir latência e
   * não depender de colunas opcionais da tabela companies durante o bootstrap
   * da sessão do usuário.
   */
  async findAuthSessionUser(id: string): Promise<UserResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    const cached = await this.getCachedAuthSessionUser(id, tenantId);
    if (cached) {
      return cached;
    }

    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: { profile: true },
      select: {
        id: true,
        nome: true,
        cpf: true,
        cpf_ciphertext: true,
        email: true,
        funcao: true,
        company_id: true,
        site_id: true,
        profile_id: true,
        identity_type: true,
        access_status: true,
        status: true,
        created_at: true,
        updated_at: true,
        profile: {
          id: true,
          nome: true,
          permissoes: true,
          status: true,
          created_at: true,
          updated_at: true,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    user.cpf = this.resolveUserCpf(user);

    const result = plainToClass(UserResponseDto, user);
    await this.cacheAuthSessionUser(id, tenantId, result);
    return result;
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const tenantId = this.getTenantIdOrThrow();
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.site', 'site')
      .addSelect('user.cpf_ciphertext')
      .where('user.id = :id', { id });

    qb.andWhere('user.company_id = :tenantId', { tenantId });

    const user = await qb.getOne();
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    user.cpf = this.resolveUserCpf(user);
    return plainToClass(UserResponseDto, user);
  }

  async findOneWithPassword(id: string): Promise<User> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.cpf_ciphertext')
      .where('user.id = :id', { id });

    if (tenantId) {
      qb.andWhere('user.company_id = :tenantId', { tenantId });
    }

    USER_WITH_PASSWORD_FIELDS.forEach((field) => {
      qb.addSelect(`user.${field}`);
    });

    const user = await qb.getOne();
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    user.cpf = this.resolveUserCpf(user);
    return user;
  }

  async findOneByCpf(cpf: string): Promise<User | null> {
    const normalizedCpf = CpfUtil.normalize(cpf);
    const cpfHash = hashSensitiveValue(normalizedCpf);

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.cpf_ciphertext')
      .where('(user.cpf_hash = :cpfHash OR user.cpf = :legacyCpf)', {
        cpfHash,
        legacyCpf: normalizedCpf,
      })
      .limit(1);

    USER_WITH_PASSWORD_FIELDS.forEach((field) => {
      qb.addSelect(`user.${field}`);
    });

    const user = await qb.getOne();

    if (user && user.status === false) {
      return null;
    }

    if (user) {
      user.cpf = this.resolveUserCpf(user);
    }

    return user;
  }

  async update(
    id: string,
    updateUserData: DeepPartial<User>,
  ): Promise<UserResponseDto> {
    // Busca a entidade original
    const tenantId = this.getTenantIdOrThrow();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const user = await this.usersRepository.findOne({
      where: { id, company_id: tenantId },
      select: {
        id: true,
        nome: true,
        cpf: true,
        cpf_ciphertext: true,
        email: true,
        funcao: true,
        status: true,
        company_id: true,
        site_id: true,
        profile_id: true,
        auth_user_id: true,
        identity_type: true,
        access_status: true,
        password: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    const previousProfileId = user.profile_id;

    const {
      password,
      company_id: attemptedCompanyId,
      cpf: nextCpfRaw,
      identity_type: requestedIdentityType,
      access_status: _ignoredAccessStatus,
      ...rest
    } = updateUserData;

    let nextNormalizedCpf: string | undefined;
    if (typeof nextCpfRaw === 'string') {
      nextNormalizedCpf = CpfUtil.normalize(nextCpfRaw);
      const cpfHash = hashSensitiveValue(nextNormalizedCpf);
      const existingCpfOwner = await this.usersRepository.findOne({
        where: [{ cpf_hash: cpfHash }, { cpf: nextNormalizedCpf }],
        select: { id: true },
      });
      if (existingCpfOwner && existingCpfOwner.id !== user.id) {
        throw new ConflictException('CPF já cadastrado');
      }
    }

    // Bloqueio de mass assignment: não permitir alteração de company_id via payload.
    // Se for necessário "mover usuário de empresa", crie um endpoint admin dedicado com
    // auditoria e validações adicionais.
    if (attemptedCompanyId) {
      this.logger.warn({
        event: 'mass_assignment_blocked',
        action: 'users.update',
        actorId: RequestContext.getUserId(),
        tenantId,
        targetUserId: id,
        attemptedCompanyId,
      });
      if (!isSuperAdmin) {
        throw new ForbiddenException(
          'Alteração de empresa do usuário não é permitida por este endpoint.',
        );
      }
    }

    // Privilege Escalation: bloquear promoção para ADMIN_GERAL por não-superadmin.
    let nextProfileName: string | undefined;
    if (rest.profile_id) {
      const profile = await this.profilesRepository.findOne({
        where: { id: rest.profile_id },
        select: { id: true, nome: true },
      });
      nextProfileName = profile?.nome;
      if (profile?.nome === Role.ADMIN_GERAL && !isSuperAdmin) {
        this.logger.warn({
          event: 'role_change_denied',
          action: 'users.update',
          actorId: RequestContext.getUserId(),
          targetUserId: id,
          requestedProfile: profile.nome,
        });
        throw new ForbiddenException(
          'Atribuição de perfil Administrador Geral não é permitida.',
        );
      }
      if (!isSuperAdmin && profile) {
        const actorUserId = RequestContext.getUserId();
        if (actorUserId) {
          await this.enforceRoleAssignmentPolicy(actorUserId, profile.nome);
        }
      }
    }
    if (!nextProfileName && user.profile_id) {
      const currentProfile = await this.profilesRepository.findOne({
        where: { id: user.profile_id },
        select: { id: true, nome: true },
      });
      nextProfileName = currentProfile?.nome;
    }

    if (rest.profile_id && rest.profile_id !== user.profile_id) {
      this.logger.warn({
        event: 'role_change',
        actorId: RequestContext.getUserId(),
        targetUserId: id,
        fromProfileId: user.profile_id,
        toProfileId: rest.profile_id,
      });
    }

    if (password && typeof password === 'string') {
      user.password = await this.passwordService.hash(password);
    }
    if (typeof rest.site_id === 'string' && rest.site_id) {
      await this.assertSiteBelongsToCompany(rest.site_id, user.company_id);
    }

    const nextEmail =
      typeof rest.email === 'string' ? rest.email : user.email || undefined;
    const nextIdentityType = this.resolveIdentityType({
      requested: requestedIdentityType,
      current: user.identity_type,
      password:
        typeof password === 'string' && password ? password : user.password,
      authUserId: user.auth_user_id,
      email: nextEmail,
    });
    this.assertIdentityCredentialContract({
      identityType: nextIdentityType,
      password:
        typeof password === 'string' && password ? password : user.password,
      authUserId: user.auth_user_id,
    });
    const authProvision: { authUserId?: string; created: boolean } =
      nextIdentityType === UserIdentityType.SYSTEM_USER
        ? await this.provisionSupabaseAuthForSnapshot({
            id: user.id,
            email: nextEmail,
            password: typeof password === 'string' ? password : undefined,
            company_id: user.company_id,
            cpf: nextNormalizedCpf || this.resolveUserCpf(user) || undefined,
            profileName: nextProfileName,
            auth_user_id: user.auth_user_id,
            status:
              typeof rest.status === 'boolean' ? rest.status : user.status,
          })
        : { created: false };
    if (authProvision.authUserId) {
      user.auth_user_id = authProvision.authUserId;
    }
    user.identity_type = nextIdentityType;
    user.access_status = this.resolveAccessStatus({
      identityType: nextIdentityType,
      password: user.password,
      authUserId: user.auth_user_id,
      email: nextEmail,
    });
    Object.assign(user, rest);
    if (nextNormalizedCpf) {
      Object.assign(user, this.buildCpfSecurityPayload(nextNormalizedCpf));
    }
    const saved = await this.usersRepository.save(user);
    saved.cpf = this.resolveUserCpf(saved);

    if (rest.profile_id && rest.profile_id !== previousProfileId) {
      await this.rbacService.invalidateUserAccess(id);
    }
    await this.invalidateAuthSessionUserCache(id);

    return plainToClass(UserResponseDto, saved);
  }

  private async assertSiteBelongsToCompany(
    siteId: string,
    companyId: string,
  ): Promise<void> {
    const site = await this.usersRepository.manager
      .getRepository(Site)
      .findOne({
        where: { id: siteId, company_id: companyId },
        select: ['id'],
      });
    if (!site) {
      throw new BadRequestException(
        'A obra/setor informada não pertence à empresa do usuário.',
      );
    }
  }

  async remove(id: string): Promise<void> {
    const tenantId = this.getTenantIdOrThrow();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const actorId = RequestContext.getUserId();

    // Auto-deleção: nenhum usuário pode excluir a si mesmo.
    if (actorId && actorId === id) {
      throw new ForbiddenException(
        'Não é permitido excluir o próprio usuário.',
      );
    }

    const user = await this.usersRepository.findOne({
      where: { id, company_id: tenantId },
      relations: { profile: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    // Restrição por role: não-ADMIN_GERAL só pode deletar COLABORADOR/TRABALHADOR.
    if (!isSuperAdmin) {
      const targetProfile = user.profile?.nome;
      const deletableProfiles = [ROLE_COLABORADOR, ROLE_TRABALHADOR];
      if (targetProfile && !deletableProfiles.includes(targetProfile)) {
        throw new ForbiddenException(
          'Você não tem permissão para excluir usuários com este perfil.',
        );
      }
    }

    // Proteção de último admin: não pode excluir o último ADMIN_EMPRESA ativo da empresa.
    if (user.profile?.nome === ROLE_ADMIN_EMPRESA) {
      const adminCount = await this.usersRepository
        .createQueryBuilder('u')
        .innerJoin('u.profile', 'p')
        .where('u.company_id = :companyId', { companyId: tenantId })
        .andWhere('p.nome = :profileName', { profileName: Role.ADMIN_EMPRESA })
        .andWhere('u.status = :status', { status: true })
        .getCount();

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'Não é possível excluir o último administrador da empresa.',
        );
      }
    }

    await this.usersRepository.remove(user);
    await this.rbacService.invalidateUserAccess(id);
    await this.invalidateAuthSessionUserCache(id);
  }

  async gdprErasure(id: string): Promise<void> {
    const tenantId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id, company_id: tenantId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const actorId = RequestContext.getUserId() || user.id;
    const companyId = tenantId;
    const ip = (RequestContext.get('ip') as string) || 'unknown';
    const userAgent = (RequestContext.get('userAgent') as string) || 'system';

    await this.usersRepository.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const auditRepo = manager.getRepository(AuditLog);

      await userRepo.update(user.id, {
        email: `deleted_${user.id}@anon.invalid`,
        nome: 'Usuário Removido',
        cpf: null,
        cpf_hash: null,
        cpf_ciphertext: null,
        funcao: null,
        status: false,
      });

      await userRepo.softDelete(user.id);

      const erasureCoverage = await manager.query<GdprErasureCoverageRow[]>(
        'SELECT table_name, deleted_count FROM gdpr_delete_user_data($1)',
        [user.id],
      );
      const normalizedCoverage = erasureCoverage.map((row) => ({
        tableName: row.table_name,
        affectedRows: this.toCount(row.deleted_count),
      }));

      await auditRepo.save(
        auditRepo.create({
          userId: actorId,
          action: AuditAction.GDPR_ERASURE,
          entity: 'USER',
          entityId: user.id,
          changes: {
            targetUserId: user.id,
            erasureCoverage: normalizedCoverage,
          },
          before: undefined,
          after: { targetUserId: user.id, erasureCoverage: normalizedCoverage },
          ip,
          userAgent,
          companyId,
        }),
      );
    });

    await this.rbacService.invalidateUserAccess(user.id);
    await this.invalidateAuthSessionUserCache(user.id);
  }

  // ---------------------------------------------------------------------------
  // Signature PIN (HMAC-SHA256)
  // ---------------------------------------------------------------------------

  async hasSignaturePin(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash'],
    });
    return Boolean(user?.signature_pin_hash);
  }

  async setSignaturePin(
    userId: string,
    pin: string,
    currentPassword?: string,
  ): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'password', 'signature_pin_hash'],
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    // Ao alterar PIN existente, exige senha atual obrigatoriamente
    if (user.signature_pin_hash) {
      if (!currentPassword) {
        throw new UnauthorizedException(
          'Senha atual obrigatória para alterar o PIN de assinatura.',
        );
      }
      const passwordOk = await this.passwordService.compare(
        currentPassword,
        user.password ?? '',
      );
      if (!passwordOk)
        throw new UnauthorizedException('Senha atual incorreta.');
    }

    const pbkdf2Salt = randomBytes(32).toString('hex');
    const pinBcryptHash = await this.passwordService.hash(pin);

    await this.usersRepository.update(userId, {
      signature_pin_hash: pinBcryptHash,
      signature_pin_salt: pbkdf2Salt,
    });
    await this.invalidateAuthSessionUserCache(userId);
  }

  async verifySignaturePin(userId: string, pin: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash'],
    });
    if (!user?.signature_pin_hash) return false;
    return this.passwordService.compare(pin, user.signature_pin_hash);
  }

  async deriveHmacKey(userId: string, pin: string): Promise<Buffer> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'signature_pin_hash', 'signature_pin_salt'],
    });
    if (!user?.signature_pin_hash || !user.signature_pin_salt) {
      throw new BadRequestException('PIN de assinatura não configurado.');
    }
    const pinOk = await this.passwordService.compare(
      pin,
      user.signature_pin_hash,
    );
    if (!pinOk) throw new UnauthorizedException('PIN inválido.');

    return pbkdf2Sync(pin, user.signature_pin_salt, 100_000, 32, 'sha256');
  }

  computeHmac(key: Buffer, message: string): string {
    return createHmac('sha256', key).update(message).digest('hex');
  }

  // ---------------------------------------------------------------------------
  // AI Consent (LGPD)
  // ---------------------------------------------------------------------------

  /**
   * Atualiza o consentimento do usuário para processamento por IA.
   * Retorna o novo valor do campo.
   */
  async updateAiConsent(
    userId: string,
    consent: boolean,
  ): Promise<{ ai_processing_consent: boolean }> {
    const tenantId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: tenantId },
    });
    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

    await this.usersRepository.update(userId, {
      ai_processing_consent: consent,
    });
    await this.invalidateAuthSessionUserCache(userId);

    return { ai_processing_consent: consent };
  }

  async syncSupabaseAuthByUserId(
    userId: string,
    overrides?: { password?: string },
  ): Promise<string | null> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
      select: {
        id: true,
        email: true,
        cpf: true,
        cpf_ciphertext: true,
        company_id: true,
        auth_user_id: true,
        status: true,
        profile: {
          id: true,
          nome: true,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${userId} não encontrado`);
    }

    const authProvision = await this.provisionSupabaseAuthForSnapshot({
      id: user.id,
      email: user.email,
      password: overrides?.password,
      company_id: user.company_id,
      cpf: this.resolveUserCpf(user) || undefined,
      profileName: user.profile?.nome,
      auth_user_id: user.auth_user_id,
      status: user.status,
    });

    if (
      authProvision.authUserId &&
      authProvision.authUserId !== user.auth_user_id
    ) {
      await this.usersRepository.update(user.id, {
        auth_user_id: authProvision.authUserId,
      });
      await this.invalidateAuthSessionUserCache(user.id);
    }

    return authProvision.authUserId || user.auth_user_id || null;
  }

  private getAuthSessionCacheTtlSeconds(): number {
    const parsed = Number(
      process.env.AUTH_SESSION_USER_CACHE_TTL_SECONDS || 60,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return Math.min(Math.floor(parsed), 300);
  }

  private getAuthSessionCacheKey(userId: string, tenantId?: string): string {
    return `auth:session_user:${userId}:${tenantId || 'global'}`;
  }

  private async getCachedAuthSessionUser(
    userId: string,
    tenantId?: string,
  ): Promise<UserResponseDto | null> {
    const ttl = this.getAuthSessionCacheTtlSeconds();
    if (ttl <= 0) {
      return null;
    }

    try {
      const raw = await this.redisService
        .getClient()
        .get(this.getAuthSessionCacheKey(userId, tenantId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as UserResponseDto;
      return plainToClass(UserResponseDto, parsed);
    } catch {
      return null;
    }
  }

  private async cacheAuthSessionUser(
    userId: string,
    tenantId: string | undefined,
    user: UserResponseDto,
  ): Promise<void> {
    const ttl = this.getAuthSessionCacheTtlSeconds();
    if (ttl <= 0) {
      return;
    }

    try {
      await this.redisService
        .getClient()
        .setex(
          this.getAuthSessionCacheKey(userId, tenantId),
          ttl,
          JSON.stringify(user),
        );
    } catch {
      // Melhor esforço: falhas de cache não devem quebrar /auth/me.
    }
  }

  private async invalidateAuthSessionUserCache(userId: string): Promise<void> {
    try {
      let cursor = '0';
      const pattern = `auth:session_user:${userId}:*`;

      do {
        const [nextCursor, keys] = await this.redisService
          .getClient()
          .scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.redisService.getClient().del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // Melhor esforço: invalidação não deve bloquear fluxo principal.
    }
  }

  /**
   * Aplica a política de atribuição de perfis/roles.
   *
   * Hierarquia de poder:
   * - ADMIN_GERAL: atribui qualquer perfil (tratado pelo chamador via isSuperAdmin)
   * - ADMIN_EMPRESA: não pode criar outro ADMIN_EMPRESA (apenas ADMIN_GERAL pode)
   * - TST: não pode atribuir ADMIN_EMPRESA ou TST
   * - SUPERVISOR: não pode atribuir ADMIN_EMPRESA, TST ou SUPERVISOR
   */
  private async enforceRoleAssignmentPolicy(
    actorId: string,
    targetProfileName: string,
  ): Promise<void> {
    const actorAccess = await this.rbacService.getUserAccess(actorId);
    const actorRoles = actorAccess.roles.map(String);

    if (
      actorRoles.includes(ROLE_ADMIN_EMPRESA) &&
      targetProfileName === ROLE_ADMIN_EMPRESA
    ) {
      throw new ForbiddenException(
        'Administradores de empresa não podem atribuir o perfil Administrador de Empresa.',
      );
    }

    if (actorRoles.includes(ROLE_TST)) {
      if (
        targetProfileName === ROLE_ADMIN_EMPRESA ||
        targetProfileName === ROLE_TST
      ) {
        throw new ForbiddenException(
          `TST não pode atribuir o perfil "${targetProfileName}".`,
        );
      }
    }

    if (actorRoles.includes(ROLE_SUPERVISOR)) {
      if (
        targetProfileName === ROLE_ADMIN_EMPRESA ||
        targetProfileName === ROLE_TST ||
        targetProfileName === ROLE_SUPERVISOR
      ) {
        throw new ForbiddenException(
          `Supervisor não pode atribuir o perfil "${targetProfileName}".`,
        );
      }
    }
  }

  private async provisionSupabaseAuthForSnapshot(input: {
    id: string;
    email?: string | null;
    password?: string;
    company_id?: string | null;
    cpf?: string;
    profileName?: string;
    auth_user_id?: string | null;
    status?: boolean;
  }): Promise<{ authUserId?: string; created: boolean }> {
    if (!this.supabaseAuthAdminService?.isSyncEnabled()) {
      return { created: false };
    }

    const result = await this.supabaseAuthAdminService.ensureUser({
      appUserId: input.id,
      authUserId: input.auth_user_id,
      email: input.email,
      password: input.password,
      companyId: input.company_id,
      cpf: input.cpf,
      profileName: input.profileName,
      status: input.status,
    });

    if (result.skipped && result.reason === 'missing_email') {
      this.logger.warn({
        event: 'supabase_auth_sync_skipped_missing_email',
        userId: input.id,
        companyId: input.company_id || null,
      });
    }

    return {
      authUserId: result.authUserId,
      created: result.created,
    };
  }

  // ---------------------------------------------------------------------------
  // Data Portability (LGPD Art. 20)
  // ---------------------------------------------------------------------------

  /**
   * Exporta os dados pessoais do próprio usuário em formato estruturado.
   * Registra trilha de auditoria com AuditAction.DATA_PORTABILITY.
   * Nunca expõe hash de senha, PIN ou salts.
   */
  async exportMyData(userId: string): Promise<ExportMyDataResponseDto> {
    const tenantId = this.getTenantIdOrThrow();

    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: tenantId },
      relations: ['profile', 'site'],
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const ip = (RequestContext.get('ip') as string) || 'unknown';
    const userAgent = (RequestContext.get('userAgent') as string) || 'system';
    const exportedAt = new Date().toISOString();
    const [consents, processingSummary] = await Promise.all([
      this.getConsentExportEvents(userId, tenantId),
      this.buildDataPortabilitySummary(userId, tenantId),
    ]);

    await this.auditService.log({
      userId,
      action: AuditAction.DATA_PORTABILITY,
      entity: 'USER',
      entityId: userId,
      changes: { exportedAt },
      ip,
      userAgent,
      companyId: tenantId || user.company_id,
    });

    return {
      exportedAt,
      dataController: 'SGS — Sistema de Gestão de Segurança',
      legalBasis: 'LGPD Art. 20 — Portabilidade de dados pessoais',
      profile: {
        id: user.id,
        nome: user.nome,
        cpf: this.resolveUserCpf(user),
        email: user.email,
        funcao: user.funcao,
        status: user.status,
        identity_type: user.identity_type,
        access_status: user.access_status,
        ai_processing_consent: user.ai_processing_consent,
        profile: user.profile
          ? { id: user.profile.id, nome: user.profile.nome }
          : null,
        site: user.site ? { id: user.site.id, nome: user.site.nome } : null,
        company_id: user.company_id,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      },
      consents,
      processingSummary,
      limitations: [...DATA_PORTABILITY_LIMITATIONS],
    };
  }
}
