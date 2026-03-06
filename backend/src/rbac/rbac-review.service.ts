import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { UserRoleEntity } from './entities/user-role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';

@Injectable()
export class RbacReviewService {
  private readonly logger = new Logger(RbacReviewService.name);

  constructor(
    @InjectRepository(UserRoleEntity)
    private readonly userRolesRepository: Repository<UserRoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionsRepository: Repository<RolePermissionEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 6 * * 1')
  async reviewPermissionsByRole(): Promise<void> {
    const [roles, rolePermissions, userRoles] = await Promise.all([
      this.rolesRepository.find(),
      this.rolePermissionsRepository.find(),
      this.userRolesRepository.find(),
    ]);

    const permissionsByRole = new Map<string, number>();
    rolePermissions.forEach((entry) => {
      permissionsByRole.set(
        entry.role_id,
        (permissionsByRole.get(entry.role_id) || 0) + 1,
      );
    });

    const usersByRole = new Map<string, number>();
    userRoles.forEach((entry) => {
      usersByRole.set(entry.role_id, (usersByRole.get(entry.role_id) || 0) + 1);
    });

    const rolesWithoutPermissions = roles
      .filter((role) => !permissionsByRole.get(role.id))
      .map((role) => ({ id: role.id, name: role.name }));
    const rolesWithoutUsers = roles
      .filter((role) => !usersByRole.get(role.id))
      .map((role) => ({ id: role.id, name: role.name }));

    const report = {
      generatedAt: new Date().toISOString(),
      rolesCount: roles.length,
      rolePermissionsCount: rolePermissions.length,
      userRolesCount: userRoles.length,
      rolesWithoutPermissions,
      rolesWithoutUsers,
    };

    if (rolesWithoutPermissions.length || rolesWithoutUsers.length) {
      this.logger.warn({
        event: 'rbac_weekly_review_attention',
        ...report,
      });
    } else {
      this.logger.log({
        event: 'rbac_weekly_review_ok',
        ...report,
      });
    }

    await this.auditService.log({
      userId: 'system-rbac-review',
      action: AuditAction.READ,
      entity: 'RBAC_REVIEW',
      entityId: 'weekly',
      changes: report,
      ip: 'internal',
      userAgent: 'scheduler',
      companyId: 'system',
    });
  }
}
