import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RedisService } from '../common/redis/redis.service';

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
    'can_use_ai',
    'can_view_system_health',
    'can_view_sites',
    'can_manage_sites',
    'can_view_dossiers',
    'can_view_documents_registry',
  ],
  'Administrador da Empresa': [
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
    'can_view_trainings',
    'can_manage_trainings',
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_users',
    'can_manage_users',
    'can_view_companies',
    'can_view_notifications',
    'can_manage_notifications',
    'can_use_ai',
    'can_view_sites',
    'can_manage_sites',
    'can_view_dossiers',
    'can_view_documents_registry',
  ],
  'Técnico de Segurança do Trabalho (TST)': [
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
    'can_view_trainings',
    'can_manage_trainings',
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_users',
    'can_manage_users',
    'can_view_notifications',
    'can_manage_notifications',
    'can_use_ai',
    'can_view_sites',
    'can_manage_sites',
    'can_view_dossiers',
    'can_view_documents_registry',
  ],
  'Supervisor / Encarregado': [
    'can_view_risks',
    'can_create_apr',
    'can_view_apr',
    'can_view_pt',
    'can_manage_pt',
    'can_view_dashboard',
    'can_view_checklists',
    'can_manage_checklists',
    'can_manage_catalogs',
    'can_view_audits',
    'can_manage_audits',
    'can_view_inspections',
    'can_manage_inspections',
    'can_view_service_orders',
    'can_manage_service_orders',
    'can_view_mail',
    'can_manage_mail',
    'can_view_signatures',
    'can_manage_signatures',
    'can_import_documents',
    'can_view_cats',
    'can_manage_cats',
    'can_view_corrective_actions',
    'can_manage_corrective_actions',
    'can_view_dds',
    'can_manage_dds',
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_notifications',
    'can_manage_notifications',
    'can_view_sites',
    'can_view_documents_registry',
  ],
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
    'can_view_rdos',
    'can_manage_rdos',
    'can_view_epi_assignments',
    'can_manage_epi_assignments',
    'can_view_notifications',
    'can_manage_notifications',
    'can_view_sites',
  ],
  Trabalhador: [
    'can_view_dashboard',
    'can_view_checklists',
    'can_view_signatures',
    'can_manage_signatures',
    'can_view_dds',
    'can_view_notifications',
    'can_manage_notifications',
    'can_view_sites',
  ],
};

type AccessBundle = {
  roles: string[];
  permissions: string[];
};

const DEFAULT_RBAC_ACCESS_CACHE_TTL_SECONDS = 120;

@Injectable()
export class RbacService {
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

  async getUserAccess(userId: string): Promise<AccessBundle> {
    const cached = await this.getCachedUserAccess(userId);
    if (cached) {
      return cached;
    }

    const userRoles = await this.userRolesRepository.find({
      where: { user_id: userId },
    });

    const roleIds = userRoles.map((userRole) => userRole.role_id);
    const roleNames = userRoles
      .map((userRole) => userRole.role?.name)
      .filter((name): name is string => Boolean(name));

    const permissionsByRoles = roleIds.length
      ? await this.rolePermissionsRepository.find({
          where: { role_id: In(roleIds) },
        })
      : [];

    const rolePermissionNames = permissionsByRoles
      .map((item) => item.permission?.name)
      .filter((name): name is string => Boolean(name));

    if (rolePermissionNames.length > 0 || roleNames.length > 0) {
      const access = this.normalizeAccessBundle({
        roles: [...new Set(roleNames)].sort(),
        permissions: [...new Set(rolePermissionNames)].sort(),
      });
      await this.cacheUserAccess(userId, access);
      return access;
    }

    const access = await this.getFallbackAccessFromProfile(userId);
    await this.cacheUserAccess(userId, access);
    return access;
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
    const keys = [...new Set(userIds.filter(Boolean))].map((userId) =>
      this.getAccessCacheKey(userId),
    );
    if (keys.length === 0) {
      return 0;
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
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    const profileName = user?.profile?.nome;
    const profilePermissions = Array.isArray(user?.profile?.permissoes)
      ? user.profile.permissoes.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      : [];

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
    return {
      roles: [...new Set(bundle.roles.filter(Boolean))].sort(),
      permissions: [...new Set(bundle.permissions.filter(Boolean))].sort(),
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

      return this.normalizeAccessBundle(parsed);
    } catch {
      return null;
    }
  }

  private async cacheUserAccess(
    userId: string,
    access: AccessBundle,
  ): Promise<void> {
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
}
