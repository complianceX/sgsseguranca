import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { TenantService } from '../tenant/tenant.service';
import { Role } from '../../auth/enums/roles.enum';

interface JwtPayload {
  company_id?: string;
  profile?: { nome?: string } | string;
}

/**
 * Extrai o contexto de tenant do JWT e o armazena na AsyncLocalStorage.
 *
 * Responsabilidades (apenas):
 *  1. Decodificar o JWT (cookie httpOnly ou Authorization header).
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
  constructor(
    private readonly tenantService: TenantService,
    private readonly jwtService: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const token = this.extractToken(req);

    let companyId: string | undefined;
    let isSuperAdmin = false;

    if (token) {
      try {
        const payload = this.jwtService.verify<JwtPayload>(token);

        companyId = payload.company_id;

        // Profile pode ser objeto {nome} ou string dependendo da versão do JWT
        const profileNome =
          typeof payload.profile === 'object'
            ? payload.profile?.nome
            : payload.profile;

        isSuperAdmin = profileNome === Role.ADMIN_GERAL;

        // SECURITY: JWT tem company_id mas header diverge → 403 sem detalhes.
        const headerCompanyId = req.headers['x-company-id'] as
          | string
          | undefined;

        if (companyId && headerCompanyId && headerCompanyId !== companyId) {
          throw new ForbiddenException();
        }

        // Admin Geral pode operar em tenant específico via header.
        if (isSuperAdmin && headerCompanyId) {
          companyId = headerCompanyId;
        }

        // Admin Geral sem header → sem company_id (acesso cross-tenant via is_super_admin).
        if (isSuperAdmin && !headerCompanyId) {
          companyId = undefined;
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        // Token inválido/expirado → sem contexto. JwtAuthGuard bloqueará rotas protegidas.
        companyId = undefined;
        isSuperAdmin = false;
      }
    }

    // Propaga o contexto para toda a cadeia async desta requisição via Node.js
    // AsyncLocalStorage. O TenantDbContextService lê este contexto no
    // pool.connect() e injeta app.current_company_id/app.is_super_admin.
    this.tenantService.run({ companyId, isSuperAdmin }, () => next());
  }

  private extractToken(req: Request): string | undefined {
    const bearer = req.headers['authorization'];
    return (
      bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined
    );
  }
}
