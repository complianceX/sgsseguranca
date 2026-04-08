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
import { DataSource } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import {
  normalizeTenantRateLimitPlan,
  TenantRateLimitPlan,
} from '../rate-limit/tenant-rate-limit.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { requestContextStorage } from './request-context.middleware';
import { AuthPrincipalService } from '../../auth/auth-principal.service';

type TenantInfo = {
  companyId?: string;
  isSuperAdmin: boolean;
  plan: TenantRateLimitPlan;
};

export interface TenantRequest extends Request {
  tenant?: TenantInfo;
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
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    const requireExplicitForSuperAdmin =
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN === 'true';

    let companyId: string | undefined;
    let isSuperAdmin = false;
    let tenantPlan: TenantRateLimitPlan =
      normalizeTenantRateLimitPlan(undefined);

    if (token) {
      try {
        let principal;
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
        const requestContext = requestContextStorage.getStore();
        if (requestContext) {
          requestContext.set('userId', principal.userId);
          requestContext.set('authUserId', principal.authUserId);
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
      await this.assertTenantIsValid(companyId);
    }

    // Expor no request (facilita uso em controllers/guards sem depender de req.user).
    req.tenant = { companyId, isSuperAdmin, plan: tenantPlan };
    const requestContext = requestContextStorage.getStore();
    if (requestContext) {
      requestContext.set('companyId', companyId);
      requestContext.set('tenantPlan', tenantPlan);
      requestContext.set('isSuperAdmin', isSuperAdmin);
    }

    // Propaga o contexto para toda a cadeia async desta requisição via Node.js
    // AsyncLocalStorage. O TenantDbContextService lê este contexto no
    // pool.connect() e injeta app.current_company_id/app.is_super_admin.
    this.tenantService.run({ companyId, isSuperAdmin }, () => next());
  }

  private extractToken(req: Request): string | undefined {
    const bearer = req.headers['authorization'];
    return bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined;
  }

  private async assertTenantIsValid(companyId: string): Promise<void> {
    // Evita DB hit por request com cache (5 min).
    const cacheKey = `tenant:valid:${companyId}`;
    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached === true) return;

    // Segurança: valida formato UUID (fail-closed)
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        companyId,
      )
    ) {
      throw new UnauthorizedException(
        'Contexto de empresa inválido. Faça login novamente.',
      );
    }

    const repo = this.dataSource.getRepository(Company);
    const company = await repo.findOne({
      where: { id: companyId, status: true },
      select: { id: true },
    });

    if (!company) {
      throw new UnauthorizedException(
        'Contexto de empresa inválido. Faça login novamente ou selecione uma empresa válida.',
      );
    }

    await this.cacheManager.set(cacheKey, true, 5 * 60 * 1000);
  }
}
