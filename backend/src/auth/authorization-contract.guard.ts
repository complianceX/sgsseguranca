import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AUTHZ_OPTIONAL_KEY } from './authz-optional.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Injectable()
export class AuthorizationContractGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    const authzOptional = this.reflector.getAllAndOverride<boolean>(
      AUTHZ_OPTIONAL_KEY,
      targets,
    );
    if (authzOptional) {
      return true;
    }

    const roles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    const permissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ??
      [];
    const declaredGuards =
      this.reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, targets) ?? [];

    if (roles.length > 0) {
      const hasRolesGuard = declaredGuards.some((guardRef) =>
        this.matchesGuard(guardRef, RolesGuard),
      );
      if (!hasRolesGuard) {
        throw new ForbiddenException(
          'Rota com @Roles sem RolesGuard explícito.',
        );
      }
    }

    if (permissions.length > 0) {
      const hasPermissionsGuard = declaredGuards.some((guardRef) =>
        this.matchesGuard(guardRef, PermissionsGuard),
      );
      if (!hasPermissionsGuard) {
        throw new ForbiddenException(
          'Rota com @Permissions sem PermissionsGuard explícito.',
        );
      }
    }

    if (roles.length > 0 || permissions.length > 0) {
      return true;
    }

    throw new ForbiddenException(
      'Rota protegida sem contrato explícito de autorização.',
    );
  }

  private matchesGuard(guardRef: unknown, guardClass: Function): boolean {
    if (guardRef === guardClass) {
      return true;
    }

    if (
      typeof guardRef === 'object' &&
      guardRef !== null &&
      'constructor' in guardRef
    ) {
      return (guardRef as { constructor?: Function }).constructor === guardClass;
    }

    return false;
  }
}
