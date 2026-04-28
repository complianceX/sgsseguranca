import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RedisService } from '../common/redis/redis.service';
import { RequestContext } from '../common/middleware/request-context.middleware';

const ADMIN_EMPRESA_FALLBACK_PERMISSIONS = [
  'can_view_risks',
  'can_edit_risks',
  'can_create_apr',
  'can_view_apr',
  'can_view_pt',
  'can_manage_pt',
  'can_approve_pt',
  'can_manage_nc',
  'can_view_dashboard',
  'can_view_checklists',
  'can_manage_checklists',
  'can_manage_catalogs',
  'can_view_audits',
  'can_manage_audits',
  'can_view_inspections',
  'can_manage_inspections',
  'can_view_medical_exams',
  'can_manage_medical_exams',
  'can_view_service_orders',
  'can_manage_service_orders',
  'can_view_mail',
  'can_manage_mail',
  'can_view_signatures',
  'can_manage_signatures',
  'can_import_documents',
  'can_view_cats',
  'can_manage_cats',
  'can_view_activities',
  'can_manage_activities',
  'can_view_corrective_actions',
  'can_manage_corrective_actions',
  'can_view_dds',
  'can_manage_dds',
  'can_view_dids',
  'can_manage_dids',
  'can_view_arrs',
  'can_manage_arrs',
  'can_view_trainings',
  'can_manage_trainings',
  'can_view_rdos',
  'can_manage_rdos',
  'can_view_epi_assignments',
  'can_manage_epi_assignments',
  'can_view_users',
  'can_manage_users',
  'can_view_companies',
  'can_view_profiles',
  'can_view_notifications',
  'can_manage_notifications',
  'can_manage_push_subscriptions',
  'can_view_calendar',
  'can_use_ai',
  'can_view_sites',
  'can_manage_sites',
  'can_view_dossiers',
  'can_view_documents_registry',
] as const;

const ADMIN_GERAL_ONLY_PERMISSIONS = [
  'can_manage_companies',
  'can_manage_profiles',
  'can_view_system_health',
  'can_manage_disaster_recovery',
] as const;

export const PROFILE_PERMISSION_FALLBACK: Record<string, string[]> = {
  'Administrador Geral': [
    'can_view_risks',
    'can_edit_risks',
    'can_create_apr',
    'can_view_apr',
    'can_view_pt',
    'can_manage_pt',
    'can_approve_pt',
    'can_manage_nc',
    'can_view_dashboard',
    'can_view_checklists',
    'can_manage_checklists',
    'can_manage_catalogs',
    'can_view_audits',
    'can_manage_audits',
    'can_view_inspections',
    'can_manage_inspections',
    'can_view_medical_exams',
    'can_manage_medical_exams',
    'can_view_service_orders',
    'can_manage_service_orders',
    'can_view_mail',
    'can_manage_mail',
    'can_view_signatures',
    'can_manage_signatures',
    'can_import_documents',
    'can_view_cats',
    'can_manage_cats',
    'can_view_activities',
    'can_manage_activities',
    'can_view_corrective_actions',
    'can_manage_corrective_actions',
    'can_view_dds',
    'can_manage_dds',
    'can_view_dids',
    'can_manage_dids',
    'can_view_arrs',
    'can_manage_arrs',
    'can_view_trainings',
    'can_manage_trainings',
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_users',
    'can_manage_users',
    'can_view_companies',
    'can_manage_companies',
    'can_view_profiles',
    'can_manage_profiles',
    'can_view_notifications',
    'can_manage_notifications',
    'can_manage_push_subscriptions',
    'can_view_calendar',
    'can_use_ai',
    'can_view_system_health',
    'can_manage_disaster_recovery',
    'can_view_sites',
    'can_manage_sites',
    'can_view_dossiers',
    'can_view_documents_registry',
  ],
  'Administrador da Empresa': [...ADMIN_EMPRESA_FALLBACK_PERMISSIONS],
  'Técnico de Segurança do Trabalho (TST)': [
    ...ADMIN_EMPRESA_FALLBACK_PERMISSIONS,
  ],
  'Supervisor / Encarregado': [...ADMIN_EMPRESA_FALLBACK_PERMISSIONS],
  'Operador / Colaborador': [
    'can_create_apr',
    'can_view_apr',
    'can_view_pt',
    'can_manage_pt',
    'can_view_dashboard',
    'can_view_signatures',
    'can_manage_signatures',
    'can_view_dds',
    'can_manage_dds',
    'can_view_dids',
    'can_manage_dids',
    'can_view_arrs',
    'can_manage_arrs',
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_notifications',
    'can_manage_notifications',
    'can_manage_push_subscriptions',
    'can_view_sites',
  ],
  Trabalhador: [
    'can_view_dashboard',
    'can_view_checklists',
    'can_view_signatures',
    'can_manage_signatures',
    'can_view_dds',
    'can_view_dids',
    'can_view_arrs',
    'can_view_notifications',
    'can_manage_notifications',
    'can_manage_push_subscriptions',
    'can_view_sites',
  ],
};

type AccessBundle = {
  roles: string[];
  permissions: string[];
};

type RbacAccessAggregateRow = {
  role_names?: unknown;
  permission_names?: unknown;
};

type ProfileFallbackRow = {
  profile_name?: string | null;
  profile_permissions?: unknown;
};

const DEFAULT_RBAC_ACCESS_CACHE_TTL_SECONDS = 120;

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);
  private readonly localAccessCache = new Map<
    string,
    { value: AccessBundle; expiresAt: number }
  >();
  private readonly accessLookupsInFlight = new Map<
    string,
    Promise<AccessBundle>
  >();

  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly userRolesRepository: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionsRepository: Repository<RolePermissionEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionsRepository: Repository<PermissionEntity>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Resolve o bundle de acesso (roles + permissions) de um usuário.
   *
   * Hierarquia de resolução:
   * 1. Cache Redis (TTL configurável via RBAC_ACCESS_CACHE_TTL_SECONDS)
   * 2. RBAC normalizado: se o usuário possui roles em `user_roles`,
   *    usa as permissions de `role_permissions` + fallback estático por role name.
   *    Esta é a fonte canônica para usuários migrados para o RBAC.
   * 3. Fallback de perfil: se o usuário não possui nenhuma role RBAC,
   *    usa `profile.permissoes` (JSONB legado) + PROFILE_PERMISSION_FALLBACK.
   *    Mantido para compatibilidade com usuários pré-migração.
   *
   * Para forçar o uso exclusivo do RBAC, atribua ao menos uma role ao usuário.
   */
  async getUserAccess(
    userId: string,
    options?: { profileName?: string | null },
  ): Promise<AccessBundle> {
    const requestCached = this.getRequestScopedAccess(userId);
    if (requestCached) {
      this.logAccessResolution('request_cache_hit', userId);
      return requestCached;
    }

    const localCached = this.getLocalAccess(userId);
    if (localCached) {
      this.setRequestScopedAccess(userId, localCached);
      this.logAccessResolution('local_cache_hit', userId);
      return localCached;
    }

    const inFlight = this.accessLookupsInFlight.get(userId);
    if (inFlight) {
      return inFlight;
    }

    const lookupPromise = this.lookupUserAccess(userId, options)
      .then((access) => {
        this.setRequestScopedAccess(userId, access);
        return access;
      })
      .finally(() => {
        this.accessLookupsInFlight.delete(userId);
      });
    this.accessLookupsInFlight.set(userId, lookupPromise);
    return lookupPromise;
  }

  async getAllPermissionNames(): Promise<string[]> {
    const rows = await this.permissionsRepository.find({
      select: { name: true },
      order: { name: 'ASC' },
    });
    return rows.map((permission) => permission.name);
  }

  /**
   * Invalida cache de acesso de um usuário específico.
   * Melhor esforço: falhas de Redis não propagam para o fluxo de negócio.
   */
  async invalidateUserAccess(userId: string): Promise<void> {
    await this.invalidateUsersAccess([userId]);
  }

  /**
   * Invalida cache de acesso para múltiplos usuários.
   * @returns quantidade de chaves alvo processadas
   */
  async invalidateUsersAccess(userIds: string[]): Promise<number> {
    const normalizedUserIds = [...new Set(userIds.filter(Boolean))];
    const keys = normalizedUserIds.map((userId) =>
      this.getAccessCacheKey(userId),
    );
    if (keys.length === 0) {
      return 0;
    }

    for (const userId of normalizedUserIds) {
      this.localAccessCache.delete(userId);
      this.accessLookupsInFlight.delete(userId);
    }

    try {
      await this.redisService.getClient().del(...keys);
      return keys.length;
    } catch {
      return 0;
    }
  }

  /**
   * Invalida cache de acesso de todos os usuários vinculados a um profile.
   */
  async invalidateUsersByProfileId(profileId: string): Promise<number> {
    if (!profileId) {
      return 0;
    }

    const rows = await this.usersRepository.find({
      where: { profile_id: profileId },
      select: { id: true },
    });

    const userIds = rows
      .map((row) => row.id)
      .filter((value): value is string => typeof value === 'string');

    return this.invalidateUsersAccess(userIds);
  }

  private async getFallbackAccessFromProfile(
    userId: string,
  ): Promise<AccessBundle> {
    const rows = (await this.usersRepository.query(
      `
        SELECT
          p.nome AS profile_name,
          p.permissoes AS profile_permissions
        FROM users u
        LEFT JOIN profiles p
          ON p.id = u.profile_id
        WHERE u.id = $1
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      [userId],
    )) as unknown;

    const user = Array.isArray(rows)
      ? ((rows[0] as ProfileFallbackRow | undefined) ?? null)
      : null;
    const profileName = user?.profile_name || undefined;
    const profilePermissions = this.toStringArray(user?.profile_permissions);

    const fallbackPermissions = profileName
      ? PROFILE_PERMISSION_FALLBACK[profileName] || []
      : [];

    return this.normalizeAccessBundle({
      roles: profileName ? [profileName] : [],
      permissions: [
        ...new Set([...fallbackPermissions, ...profilePermissions]),
      ].sort(),
    });
  }

  private async getAccessFromNormalizedRoles(
    userId: string,
  ): Promise<AccessBundle | null> {
    const rows = (await this.userRolesRepository.query(
      `
        SELECT
          COALESCE(
            (
              SELECT array_agg(role_name ORDER BY role_name)
              FROM (
                SELECT DISTINCT r.name AS role_name
                FROM user_roles ur
                INNER JOIN roles r
                  ON r.id = ur.role_id
                WHERE ur.user_id = $1
                  AND r.name IS NOT NULL
              ) role_names
            ),
            ARRAY[]::text[]
          ) AS role_names,
          COALESCE(
            (
              SELECT array_agg(permission_name ORDER BY permission_name)
              FROM (
                SELECT DISTINCT p.name AS permission_name
                FROM user_roles ur
                INNER JOIN role_permissions rp
                  ON rp.role_id = ur.role_id
                INNER JOIN permissions p
                  ON p.id = rp.permission_id
                WHERE ur.user_id = $1
                  AND p.name IS NOT NULL
              ) permission_names
            ),
            ARRAY[]::text[]
          ) AS permission_names
      `,
      [userId],
    )) as unknown;

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const aggregate = rows[0] as RbacAccessAggregateRow;
    const roleNames = this.toStringArray(aggregate.role_names);
    const rolePermissionNames = this.toStringArray(aggregate.permission_names);
    const fallbackPermissionNames =
      this.getFallbackPermissionsForRoleNames(roleNames);

    if (rolePermissionNames.length === 0 && roleNames.length === 0) {
      return null;
    }

    return this.normalizeAccessBundle({
      roles: roleNames,
      permissions: [
        ...new Set([...rolePermissionNames, ...fallbackPermissionNames]),
      ].sort(),
    });
  }

  private getFallbackPermissionsForRoleNames(roleNames: string[]): string[] {
    return [
      ...new Set(
        roleNames.flatMap(
          (roleName) => PROFILE_PERMISSION_FALLBACK[roleName] || [],
        ),
      ),
    ];
  }

  private getAccessCacheKey(userId: string): string {
    return `rbac:access:${userId}`;
  }

  private getAccessCacheTtlSeconds(): number {
    const raw = Number(
      process.env.RBAC_ACCESS_CACHE_TTL_SECONDS ||
        DEFAULT_RBAC_ACCESS_CACHE_TTL_SECONDS,
    );

    if (!Number.isFinite(raw) || raw <= 0) {
      return 0;
    }

    return Math.min(Math.floor(raw), 300);
  }

  private normalizeAccessBundle(bundle: AccessBundle): AccessBundle {
    const isAdminGeral = bundle.roles.includes('Administrador Geral');
    const permissions = isAdminGeral
      ? bundle.permissions
      : bundle.permissions.filter(
          (permission) =>
            !ADMIN_GERAL_ONLY_PERMISSIONS.includes(
              permission as (typeof ADMIN_GERAL_ONLY_PERMISSIONS)[number],
            ),
        );

    return {
      roles: [...new Set(bundle.roles.filter(Boolean))].sort(),
      permissions: [...new Set(permissions.filter(Boolean))].sort(),
    };
  }

  private isAccessBundle(value: unknown): value is AccessBundle {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<AccessBundle>;
    return (
      Array.isArray(candidate.roles) &&
      Array.isArray(candidate.permissions) &&
      candidate.roles.every((item) => typeof item === 'string') &&
      candidate.permissions.every((item) => typeof item === 'string')
    );
  }

  private async getCachedUserAccess(
    userId: string,
  ): Promise<AccessBundle | null> {
    const ttlSeconds = this.getAccessCacheTtlSeconds();
    if (ttlSeconds <= 0) {
      return null;
    }

    try {
      const raw = await this.redisService
        .getClient()
        .get(this.getAccessCacheKey(userId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!this.isAccessBundle(parsed)) {
        return null;
      }

      const normalized = this.normalizeAccessBundle(parsed);
      this.setLocalAccess(userId, normalized);
      this.setRequestScopedAccess(userId, normalized);
      this.logAccessResolution('redis_cache_hit', userId);
      return normalized;
    } catch {
      return null;
    }
  }

  private async cacheUserAccess(
    userId: string,
    access: AccessBundle,
  ): Promise<void> {
    this.setLocalAccess(userId, access);
    const ttlSeconds = this.getAccessCacheTtlSeconds();
    if (ttlSeconds <= 0) {
      return;
    }

    try {
      await this.redisService
        .getClient()
        .setex(
          this.getAccessCacheKey(userId),
          ttlSeconds,
          JSON.stringify(access),
        );
    } catch {
      // Cache de RBAC é melhor esforço: falha de Redis não deve bloquear login/sessão.
    }
  }

  private async lookupUserAccess(
    userId: string,
    options?: { profileName?: string | null },
  ): Promise<AccessBundle> {
    const cached = await this.getCachedUserAccess(userId);
    if (cached) {
      return cached;
    }

    const normalizedAccess = await this.getAccessFromNormalizedRoles(userId);
    if (normalizedAccess) {
      const access = this.normalizeAccessBundle(normalizedAccess);
      await this.cacheUserAccess(userId, access);
      this.logAccessResolution('normalized_roles', userId);
      return access;
    }

    const access = await this.getFallbackAccessFromProfile(userId);
    if (access.roles.length > 0 || access.permissions.length > 0) {
      await this.cacheUserAccess(userId, access);
      this.logAccessResolution('profile_legacy_fallback', userId);
      return access;
    }

    // Último recurso: hint de perfil vindo do token/cache de sessão.
    // Nunca deve ter prioridade sobre RBAC/Profiles persistidos no banco.
    const hintedAccess = this.getAccessFromProfileName(options?.profileName);
    if (hintedAccess) {
      await this.cacheUserAccess(userId, hintedAccess);
      this.logAccessResolution('profile_hint_cache_only', userId, {
        profileName: options?.profileName || undefined,
      });
      return hintedAccess;
    }

    await this.cacheUserAccess(userId, access);
    this.logAccessResolution('empty_access_bundle', userId);
    return access;
  }

  private getAccessFromProfileName(
    profileName?: string | null,
  ): AccessBundle | null {
    const normalizedProfileName = profileName?.trim();
    if (!normalizedProfileName) {
      return null;
    }

    const fallbackPermissions =
      PROFILE_PERMISSION_FALLBACK[normalizedProfileName];
    if (!fallbackPermissions) {
      return null;
    }

    return this.normalizeAccessBundle({
      roles: [normalizedProfileName],
      permissions: [...fallbackPermissions],
    });
  }

  private getRequestScopedAccess(userId: string): AccessBundle | null {
    return RequestContext.get<AccessBundle>(`rbac:request:${userId}`) || null;
  }

  private setRequestScopedAccess(userId: string, access: AccessBundle): void {
    RequestContext.set(`rbac:request:${userId}`, access);
  }

  private getLocalAccess(userId: string): AccessBundle | null {
    const cached = this.localAccessCache.get(userId);
    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.localAccessCache.delete(userId);
      return null;
    }

    return cached.value;
  }

  private setLocalAccess(userId: string, access: AccessBundle): void {
    const ttlMs = this.getLocalAccessCacheTtlMs();
    if (ttlMs <= 0) {
      return;
    }

    this.localAccessCache.set(userId, {
      value: access,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private getLocalAccessCacheTtlMs(): number {
    const raw = Number(process.env.RBAC_ACCESS_LOCAL_CACHE_TTL_SECONDS || 60);

    if (!Number.isFinite(raw) || raw <= 0) {
      return 0;
    }

    return Math.min(Math.floor(raw), 120) * 1000;
  }

  private logAccessResolution(
    source:
      | 'request_cache_hit'
      | 'local_cache_hit'
      | 'redis_cache_hit'
      | 'profile_hint_cache_only'
      | 'normalized_roles'
      | 'profile_legacy_fallback'
      | 'empty_access_bundle',
    userId: string,
    extra?: Record<string, unknown>,
  ): void {
    if (String(process.env.RBAC_ACCESS_DEBUG || '').toLowerCase() !== 'true') {
      return;
    }

    this.logger.debug({
      event: 'rbac_access_resolution',
      source,
      userId,
      requestId: RequestContext.getRequestId(),
      traceId: RequestContext.getTraceId(),
      ...extra,
    });
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    );
  }
}
