import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        userId?: string;
        id?: string;
        roles?: string[];
        permissions?: string[];
        profile?: { nome?: string };
      };
    }>();
    const userId = request.user?.userId || request.user?.id;
    const profileName = request.user?.profile?.nome;

    if (!userId) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    const access = await this.rbacService.getUserAccess(userId, {
      profileName,
    });
    request.user = {
      ...(request.user || {}),
      id: userId,
      userId,
      roles: access.roles,
      permissions: access.permissions,
    };

    const missingPermissions = requiredPermissions.filter(
      (permission) => !access.permissions.includes(permission),
    );

    if (missingPermissions.length) {
      throw new ForbiddenException(
        `Permissões insuficientes: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
