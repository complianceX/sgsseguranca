import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RbacService } from './rbac.service';
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
    ]),
  ],
  providers: [RbacService, RbacReviewService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
