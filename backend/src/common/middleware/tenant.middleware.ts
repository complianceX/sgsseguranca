import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../../auth/enums/roles.enum';
import { DataSource } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { requestContextStorage } from './request-context.middleware';

interface JwtPayload {
  sub?: string;
  company_id?: string;
  cpf?: string;
  // profile deve ser sempre { nome } (formato normalizado desde auth.service.ts login()).
  // O union com string é mantido apenas para compatibilidade de leitura de tokens legados,
  // mas string nunca concede privilégios — veja a lógica de extração abaixo.
  profile?: { nome?: string } | string;
}

type TenantInfo = {
  companyId?: string;
  isSuperAdmin: boolean;
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
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    const requireExplicitForSuperAdmin =
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN === 'true';

    let companyId: string | undefined;
    let isSuperAdmin = false;

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token);
        const requestContext = requestContextStorage.getStore();
        if (requestContext) {
          requestContext.set('userId', payload.sub);
        }

        companyId = payload.company_id;

        // Extração defensiva do profile: somente a forma objeto { nome } é aceita
        // para determinar privilégios. Tokens legados com profile como string simples
        // NUNCA recebem status de super-admin — evita escalada via token malformado.
        let profileNome: string | undefined;
        if (typeof payload.profile === 'object' && payload.profile !== null) {
          profileNome = payload.profile.nome;
        } else if (typeof payload.profile === 'string') {
          // Token legado: logar aviso e tratar como não-privilegiado.
          this.logger.warn({
            event: 'legacy_string_profile_in_jwt',
            userId: payload.sub,
            path: req.originalUrl || req.url,
          });
          profileNome = undefined;
        }

        isSuperAdmin = profileNome === Role.ADMIN_GERAL;

        // SECURITY: JWT tem company_id mas header diverge → 403 sem detalhes.
        const headerCompanyId = req.headers['x-company-id'] as
          | string
          | undefined;

        if (isSuperAdmin) {
          if (headerCompanyId) {
            this.logger.log({
              event: 'tenant_switch',
              userId: payload.sub,
              tenantId: headerCompanyId,
              ip: req.ip,
              path: req.originalUrl || req.url,
            });
            companyId = headerCompanyId;
          } else {
            if (requireExplicitForSuperAdmin) {
              this.logger.warn({
                event: 'super_admin_missing_explicit_tenant',
                userId: payload.sub,
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
              event: 'tenant_spoof_attempt',
              userId: payload.sub,
              headerCompanyId,
              ip: req.ip,
              path: req.originalUrl || req.url,
            });
            throw new ForbiddenException();
          }

          if (companyId && headerCompanyId && headerCompanyId !== companyId) {
            this.logger.warn({
              event: 'tenant_spoof_attempt',
              userId: payload.sub,
              tokenCompanyId: companyId,
              headerCompanyId,
              ip: req.ip,
              path: req.originalUrl || req.url,
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
    if (companyId && !isSuperAdmin) {
      await this.assertTenantIsValid(companyId);
    } else if (companyId && isSuperAdmin) {
      // Admin geral operando em tenant específico
      await this.assertTenantIsValid(companyId);
    }

    // Expor no request (facilita uso em controllers/guards sem depender de req.user).
    req.tenant = { companyId, isSuperAdmin };
    const requestContext = requestContextStorage.getStore();
    if (requestContext) {
      requestContext.set('companyId', companyId);
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
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
