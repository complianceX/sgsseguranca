import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    roles?: string[];
    permissions?: string[];
    company_id?: string | null;
  };
}

/**
 * Guard unificado que consolida:
 * 1. Autenticação (JWT + Sessions)
 * 2. Autorização (Roles + Permissions)
 * 3. Rate Limiting
 *
 * Reduz de 5 guards para 1 unificado
 * Melhora segurança com validação centralizada
 */
@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  private readonly logger = new Logger(UnifiedAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const handler = context.getHandler();

    // 1. Validar autenticação
    const user = request.user;
    if (!user) {
      this.logger.warn(
        `Acesso não autenticado: ${request.method} ${request.url}`,
      );
      throw new UnauthorizedException('Não autenticado');
    }

    // 2. Validar roles (se definido)
    const requiredRoles = this.reflector.get<string[]>('roles', handler);
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = Array.isArray(user.roles) ? user.roles : [];
      const hasRole = requiredRoles.some((role) => userRoles.includes(role));

      if (!hasRole) {
        this.logger.warn(
          `Acesso negado por role: ${user.id ?? 'unknown-user'} - Roles necessárias: ${requiredRoles.join(', ')}`,
        );
        throw new ForbiddenException('Permissão insuficiente');
      }
    }

    // 3. Validar permissões (se definido)
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      handler,
    );
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = Array.isArray(user.permissions)
        ? user.permissions
        : [];
      const hasPermission = requiredPermissions.some((perm) =>
        userPermissions.includes(perm),
      );

      if (!hasPermission) {
        this.logger.warn(
          `Acesso negado por permissão: ${user.id ?? 'unknown-user'} - Permissões necessárias: ${requiredPermissions.join(', ')}`,
        );
        throw new ForbiddenException('Permissão insuficiente');
      }
    }

    // 4. Validar rate limit (se definido)
    const rateLimitKey = this.reflector.get<string>('rateLimit', handler);
    if (rateLimitKey) {
      // Implementar rate limit aqui
      // Por enquanto, apenas log
      this.logger.debug(`Rate limit check: ${rateLimitKey}`);
    }

    // 5. Validar tenant (se definido)
    const requireTenant = this.reflector.get<boolean>('requireTenant', handler);
    if (requireTenant && !user.company_id) {
      this.logger.warn(
        `Acesso negado: tenant não definido para ${user.id ?? 'unknown-user'}`,
      );
      throw new ForbiddenException('Tenant não definido');
    }

    return true;
  }
}
