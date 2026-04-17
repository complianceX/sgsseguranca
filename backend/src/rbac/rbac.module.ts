import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RbacService } from './rbac.service';
import { RbacWarmupService } from './rbac-warmup.service';
import { RbacReviewService } from './rbac-review.service';
import { PermissionsGuard } from '../auth/permissions.guard';

@Global()
@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      User,
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleEntity,
      UserSession,
    ]),
  ],
  providers: [
    RbacService,
    RbacWarmupService,
    RbacReviewService,
    PermissionsGuard,
  ],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
