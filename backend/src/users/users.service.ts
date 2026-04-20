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

  async create(createUserData: DeepPartial<User>): Promise<UserResponseDto> {
    const { password, ...rest } = createUserData;
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
    const authProvision = await this.provisionSupabaseAuthForSnapshot({
      id: userId,
      email: typeof rest.email === 'string' ? rest.email : undefined,
      password: typeof password === 'string' ? password : undefined,
      company_id: companyId,
      cpf: normalizedCpf,
      profileName,
      auth_user_id:
        typeof createUserData.auth_user_id === 'string'
          ? createUserData.auth_user_id
          : undefined,
      status: typeof rest.status === 'boolean' ? rest.status : true,
    });
    const cpfSecurityPayload = this.buildCpfSecurityPayload(normalizedCpf);
    const user = this.usersRepository.create({
      id: userId,
      ...rest,
      ...cpfSecurityPayload,
      company_id: companyId,
      auth_user_id: authProvision.authUserId || undefined,
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
    companyId?: string;
    siteId?: string;
  }): Promise<OffsetPage<UserResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const requestSiteId = RequestContext.getSiteId();
    const requestedSiteId = opts?.siteId?.trim() || undefined;
    const effectiveSiteId = isSuperAdmin
      ? requestedSiteId
      : requestSiteId || undefined;
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .addSelect('user.cpf_ciphertext')
      .addSelect('user.cpf_hash')
      .skip(skip)
      .take(limit)
      .orderBy('user.nome', 'ASC');

    if (tenantId) {
      qb.where('user.company_id = :tenantId', { tenantId });
    } else if (opts?.companyId) {
      qb.where('user.company_id = :companyId', {
        companyId: opts.companyId,
      });
    }

    if (effectiveSiteId) {
      qb.andWhere('user.site_id = :siteId', {
        siteId: effectiveSiteId,
      });
    } else if (!isSuperAdmin) {
      qb.andWhere('1 = 0');
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
        Boolean(tenantId || opts?.companyId || effectiveSiteId) ||
        !isSuperAdmin;
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
    const tenantId = this.tenantService.getTenantId();
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.site', 'site')
      .addSelect('user.cpf_ciphertext')
      .where('user.id = :id', { id });

    if (tenantId) {
      qb.andWhere('user.company_id = :tenantId', { tenantId });
    }

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
    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
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

    const nextEmail =
      typeof rest.email === 'string' ? rest.email : user.email || undefined;
    const authProvision = await this.provisionSupabaseAuthForSnapshot({
      id: user.id,
      email: nextEmail,
      password: typeof password === 'string' ? password : undefined,
      company_id: user.company_id,
      cpf: nextNormalizedCpf || this.resolveUserCpf(user) || undefined,
      profileName: nextProfileName,
      auth_user_id: user.auth_user_id,
      status: typeof rest.status === 'boolean' ? rest.status : user.status,
    });
    if (authProvision.authUserId) {
      user.auth_user_id = authProvision.authUserId;
    }
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

  async remove(id: string): Promise<void> {
    // Busca a entidade para verificar existência
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }
    await this.usersRepository.remove(user);
    await this.rbacService.invalidateUserAccess(id);
    await this.invalidateAuthSessionUserCache(id);
  }

  async gdprErasure(id: string): Promise<void> {
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${id} não encontrado`);
    }

    const actorId = RequestContext.getUserId() || user.id;
    const companyId = tenantId || user.company_id;
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

      await auditRepo.save(
        auditRepo.create({
          userId: actorId,
          action: AuditAction.GDPR_ERASURE,
          entity: 'USER',
          entityId: user.id,
          changes: { targetUserId: user.id },
          before: undefined,
          after: { targetUserId: user.id },
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
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id: userId, company_id: tenantId } : { id: userId },
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
    const tenantId = this.tenantService.getTenantId();

    const user = await this.usersRepository.findOne({
      where: tenantId ? { id: userId, company_id: tenantId } : { id: userId },
      relations: ['profile', 'site'],
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const ip = (RequestContext.get('ip') as string) || 'unknown';
    const userAgent = (RequestContext.get('userAgent') as string) || 'system';
    const exportedAt = new Date().toISOString();

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
        ai_processing_consent: user.ai_processing_consent,
        profile: user.profile
          ? { id: user.profile.id, nome: user.profile.nome }
          : null,
        site: user.site ? { id: user.site.id, nome: user.site.nome } : null,
        company_id: user.company_id,
        created_at: user.created_at.toISOString(),
        updated_at: user.updated_at.toISOString(),
      },
    };
  }
}
