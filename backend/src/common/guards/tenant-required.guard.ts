import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../../auth/enums/roles.enum';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestWithUser extends Request {
  user?: {
    profile?: {
      nome: string;
    };
  };
}

@Injectable()
export class TenantRequiredGuard implements CanActivate {
  constructor(
    private tenantService: TenantService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const tenantId = this.tenantService.getTenantId();
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // Admin geral não precisa de tenant (pode ver tudo ou escolhe contexto depois)
    if (user?.profile?.nome === Role.ADMIN_GERAL) {
      return true;
    }

    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }

    return true;
  }
}
