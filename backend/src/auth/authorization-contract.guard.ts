import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AUTHZ_OPTIONAL_KEY } from './authz-optional.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ROLES_KEY } from './roles.decorator';

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

    if (roles.length > 0 || permissions.length > 0) {
      return true;
    }

    throw new ForbiddenException(
      'Rota protegida sem contrato explícito de autorização.',
    );
  }
}
