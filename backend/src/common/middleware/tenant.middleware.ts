import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../../auth/enums/roles.enum';
import {
  normalizeTenantRateLimitPlan,
  TenantRateLimitPlan,
} from '../rate-limit/tenant-rate-limit.service';
import { requestContextStorage } from './request-context.middleware';
import { AuthPrincipalService } from '../../auth/auth-principal.service';
import type { AuthenticatedPrincipal } from '../../auth/auth-principal.service';
import { TenantValidationService } from '../tenant/tenant-validation.service';
import { SecurityAuditService } from '../security/security-audit.service';

type TenantInfo = {
  companyId?: string;
  isSuperAdmin: boolean;
  plan: TenantRateLimitPlan;
  userId?: string;
  siteId?: string;
  siteIds?: string[];
  siteScope?: 'single' | 'all';
};

export interface TenantRequest extends Request {
  tenant?: TenantInfo;
  authPrincipal?: AuthenticatedPrincipal;
}

/**
 * Extrai o contexto de tenant do JWT e o armazena na AsyncLocalStorage.
 *
 * Responsabilidades (apenas):
 *  1. Decodificar o JWT (Authorization header).
 *  2. Extrair company_id e isSuperAdmin.
 *  3. Validar que o header x-company-id não diverge do JWT (anti-spoofing).
 *  4. Chamar tenantService.run() para isolar o contexto nesta requisição.
 *
 * O que este middleware NÃO faz mais:
 *  - Abrir queryRunners ou transações (gerava conexão extra por request).
 *  - Chamar SET/RESET no banco (responsabilidade do TenantDbContextService).
 *  - Validar autenticação (responsabilidade do JwtAuthGuard).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly authPrincipalService: AuthPrincipalService,
    private readonly tenantValidationService: TenantValidationService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    const requireExplicitForSuperAdmin =
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN === 'true';

    let companyId: string | undefined;
    let isSuperAdmin = false;
    let tenantPlan: TenantRateLimitPlan =
      normalizeTenantRateLimitPlan(undefined);
    let principal: AuthenticatedPrincipal | undefined;

    if (token) {
      try {
        try {
          principal =
            await this.authPrincipalService.verifyAndResolveAccessToken(token);
        } catch {
          principal = undefined;
        }

        if (!principal) {
          companyId = undefined;
          isSuperAdmin = false;
          tenantPlan = normalizeTenantRateLimitPlan(undefined);
          throw new Error('access_token_invalid_or_unsupported');
        }
        req.authPrincipal = principal;
        const requestContext = requestContextStorage.getStore();
        if (requestContext) {
          requestContext.set('userId', principal.userId);
          requestContext.set('authUserId', principal.authUserId);
          requestContext.set('authPrincipal', principal);
          requestContext.set('siteId', principal.siteId ?? principal.site_id);
          requestContext.set('siteIds', principal.siteIds ?? []);
          requestContext.set('profileName', principal.profile?.nome);
        }

        companyId = principal.companyId;
        tenantPlan = normalizeTenantRateLimitPlan(principal.plan);
        isSuperAdmin =
          principal.isSuperAdmin ||
          principal.profile?.nome === Role.ADMIN_GERAL;

        // SECURITY: JWT tem company_id mas header diverge → 403 sem detalhes.
        const headerCompanyId = req.headers['x-company-id'] as
          | string
          | undefined;

        if (isSuperAdmin) {
          if (headerCompanyId) {
            this.logger.log({
              event: 'tenant_switch',
              userId: principal.userId,
              tenantId: headerCompanyId,
              ip: req.ip,
              path: req.originalUrl || req.url,
            });
            // Registra acesso cross-tenant na forensic trail para auditoria
            this.securityAudit.adminAction(
              principal.userId,
              `tenant_switch:${headerCompanyId}`,
            );
            companyId = headerCompanyId;
          } else {
            if (requireExplicitForSuperAdmin) {
              this.logger.warn({
                event: 'super_admin_missing_explicit_tenant',
                userId: principal.userId,
                ip: req.ip,
                path: req.originalUrl || req.url,
              });
              throw new UnauthorizedException(
                'Administrador Geral deve informar o tenant via header x-company-id.',
              );
            }

            companyId = undefined;
          }
        } else {
          // Usuário comum:
          // - Nunca confiar no header `x-company-id` se divergir do tenant do JWT.
          // - Se header existir, deve ser exatamente o tenant do JWT.
          if (!companyId && headerCompanyId) {
            this.logger.warn({
              event: 'cross_tenant_spoof_attempt',
              severity: 'HIGH',
              userId: principal.userId,
              headerCompanyId,
              tokenCompanyId: null,
              ip: req.ip,
              method: req.method,
              path: req.originalUrl || req.url,
              userAgent: (req.headers['user-agent'] as string)?.slice(0, 200),
              timestamp: new Date().toISOString(),
            });
            throw new ForbiddenException();
          }

          if (companyId && headerCompanyId && headerCompanyId !== companyId) {
            this.logger.warn({
              event: 'cross_tenant_spoof_attempt',
              severity: 'CRITICAL',
              userId: principal.userId,
              tokenCompanyId: companyId,
              headerCompanyId,
              ip: req.ip,
              method: req.method,
              path: req.originalUrl || req.url,
              userAgent: (req.headers['user-agent'] as string)?.slice(0, 200),
              timestamp: new Date().toISOString(),
            });
            throw new ForbiddenException();
          }
        }
      } catch (err) {
        if (
          err instanceof ForbiddenException ||
          err instanceof UnauthorizedException
        ) {
          throw err;
        }
        // Token inválido/expirado → sem contexto. JwtAuthGuard bloqueará rotas protegidas.
        companyId = undefined;
        isSuperAdmin = false;
      }
    }

    // Validação do tenant:
    // - Usuário comum: company_id sempre deve existir e apontar para uma empresa válida/ativa.
    // - Admin geral: valida apenas quando escolhe um tenant (via header x-company-id).
    if (companyId) {
      await this.tenantValidationService.assertTenantIsValid(companyId);
    }

    const siteScope = this.resolveSiteScope(
      principal?.profile?.nome,
      isSuperAdmin,
    );

    // Expor no request (facilita uso em controllers/guards sem depender de req.user).
    req.tenant = {
      companyId,
      isSuperAdmin,
      plan: tenantPlan,
      userId: req.authPrincipal?.userId,
      siteId: req.authPrincipal?.siteId ?? req.authPrincipal?.site_id,
      siteIds: req.authPrincipal?.siteIds ?? [],
      siteScope,
    };
    const requestContext = requestContextStorage.getStore();
    if (requestContext) {
      requestContext.set('companyId', companyId);
      requestContext.set('tenantPlan', tenantPlan);
      requestContext.set('isSuperAdmin', isSuperAdmin);
    }

    // Propaga o contexto para toda a cadeia async desta requisição via Node.js
    // AsyncLocalStorage. O TenantDbContextService lê este contexto no
    // pool.connect() e injeta app.current_company_id/app.is_super_admin.
    this.tenantService.run(
      {
        companyId,
        isSuperAdmin,
        userId: req.authPrincipal?.userId,
        siteId: req.authPrincipal?.siteId ?? req.authPrincipal?.site_id,
        siteIds: req.authPrincipal?.siteIds ?? [],
        siteScope,
      },
      () => next(),
    );
  }

  private extractToken(req: Request): string | undefined {
    const bearer = req.headers['authorization'];
    return bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined;
  }

  private resolveSiteScope(
    profileName: string | undefined,
    isSuperAdmin: boolean,
  ): 'single' | 'all' {
    if (isSuperAdmin) {
      return 'all';
    }

    if (
      profileName === Role.ADMIN_GERAL ||
      profileName === Role.ADMIN_EMPRESA
    ) {
      return 'all';
    }

    return 'single';
  }
}
