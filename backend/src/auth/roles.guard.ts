import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role } from './enums/roles.enum';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<string[] | Role[]>(
      ROLES_KEY,
      targets,
    );
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      targets,
    );

    // Default-deny para rotas sem contrato de autorização explícito.
    // Se a rota usa @Authorize/@Permissions, o PermissionsGuard decide a
    // autorização fina e o RolesGuard não deve bloquear antes dele.
    if (!requiredRoles || requiredRoles.length === 0) {
      if (requiredPermissions?.length) {
        return true;
      }

      this.logger.warn({
        event: 'unauthorized_access_no_roles_required',
        path: context.getHandler().name,
        class: context.getClass().name,
        timestamp: new Date().toISOString(),
      });
      throw new ForbiddenException('Acesso negado: função não especificada');
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        userId?: string;
        id?: string;
        profile?: { nome: string };
      };
    }>();
    const userId = request.user?.userId || request.user?.id;
    const rawUserRole = request.user?.profile?.nome;
    const userRole = this.normalizeRole(rawUserRole);
    const normalizedRequiredRoles = (requiredRoles || [])
      .map((role) => this.normalizeRole(role))
      .filter((role): role is Role => !!role);

    if (!userId) {
      this.logger.warn({
        event: 'unauthorized_access_no_user',
        path: context.getHandler().name,
        class: context.getClass().name,
        timestamp: new Date().toISOString(),
      });
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Validar que o role do usuário é válido
    if (!userRole) {
      this.logger.warn({
        event: 'unauthorized_access_invalid_role',
        userId,
        attemptedRole: rawUserRole,
        requiredRoles,
        path: context.getHandler().name,
        class: context.getClass().name,
        timestamp: new Date().toISOString(),
      });
      throw new ForbiddenException('Função de usuário inválida');
    }

    // Verificar se o usuário tem uma das roles requeridas
    if (!this.hasRequiredRole(userRole, normalizedRequiredRoles)) {
      // Buscar acesso completo via RBAC para logging detalhado
      try {
        const access = await this.rbacService.getUserAccess(userId, {
          profileName: rawUserRole,
        });
        this.logger.warn({
          event: 'unauthorized_access_insufficient_role',
          userId,
          userRole,
          userRoles: access.roles,
          userPermissions: access.permissions,
          requiredRoles,
          path: context.getHandler().name,
          class: context.getClass().name,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Se falhar ao buscar acesso, log sem detalhes adicionais
        this.logger.warn({
          event: 'unauthorized_access_insufficient_role',
          userId,
          userRole,
          requiredRoles,
          path: context.getHandler().name,
          class: context.getClass().name,
          error: message,
          timestamp: new Date().toISOString(),
        });
      }

      throw new ForbiddenException('Função insuficiente para esta operação');
    }

    return true;
  }

  private normalizeRole(role?: string | Role): Role | null {
    if (!role) {
      return null;
    }

    const roleAliases: Record<string, Role> = {
      'ADMINISTRADOR EMPRESA': Role.ADMIN_EMPRESA,
      'ADMINISTRADOR DA EMPRESA': Role.ADMIN_EMPRESA,
      ADMIN_EMPRESA: Role.ADMIN_EMPRESA,
      TECNICO: Role.TST,
      'TECNICO SST': Role.TST,
      'TECNICO DE SEGURANCA DO TRABALHO': Role.TST,
      TST: Role.TST,
      SUPERVISOR: Role.SUPERVISOR,
    };

    if (Object.values(Role).includes(role as Role)) {
      return role as Role;
    }

    const normalizedRole = String(role)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const aliasedRole = roleAliases[normalizedRole];
    if (aliasedRole) {
      return aliasedRole;
    }

    const matchedEntry = Object.entries(Role).find(
      ([key, value]) =>
        key === normalizedRole || value.toUpperCase() === normalizedRole,
    );

    return matchedEntry ? (matchedEntry[1] as Role) : null;
  }

  private hasRequiredRole(userRole: Role, requiredRoles: Role[]): boolean {
    if (requiredRoles.includes(userRole)) {
      return true;
    }

    if (userRole === Role.ADMIN_GERAL) {
      return true;
    }

    const companyScopedRoles = [Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR];
    return (
      companyScopedRoles.includes(userRole) &&
      requiredRoles.some((role) => companyScopedRoles.includes(role))
    );
  }
}
