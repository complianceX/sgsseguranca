import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../tenant/tenant.service';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../auth/enums/roles.enum';
import { DataSource } from 'typeorm';
import { tenantStorage } from '../tenant/tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private tenantService: TenantService,
    private jwtService: JwtService, // SECURITY: Usado para validar token e extrair company_id criptograficamente
    private dataSource: DataSource,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // SECURITY: Extrai possível token do cookie httpOnly ou do header Authorization
    const bearer = req.headers['authorization'] || undefined;
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      'access_token'
    ];
    const token =
      cookieToken ||
      (bearer && bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined);

    // SECURITY: Valida que o header não foi forjado pelo cliente
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;

    let jwtCompanyId: string | undefined;
    let isAdminGlobal = false;

    if (token) {
      try {
        const payload = this.jwtService.verify<{
          company_id?: string;
          profile?: { nome?: string };
        }>(token);
        // SECURITY: company_id do JWT é a fonte de verdade do tenant do usuário autenticado
        jwtCompanyId = payload.company_id;
        // SECURITY: Admin Geral tem privilégios globais; não força vinculação a tenant
        isAdminGlobal = payload.profile?.nome === Role.ADMIN_GERAL;
      } catch {
        // SECURITY: Token inválido → não define contexto; não derruba rota pública
        jwtCompanyId = undefined;
      }
    }

    // SECURITY: Se JWT possui company_id e header diverge → 403 sem detalhes
    if (jwtCompanyId && headerCompanyId && headerCompanyId !== jwtCompanyId) {
      throw new ForbiddenException(); // SECURITY: não vazar qual campo falhou
    }

    // SECURITY: Regra clara quando JWT não tem company_id
    // - Admin Geral: permitido sem header, contexto só se header for fornecido
    // - Usuário sem company_id e com header: rejeita para evitar elevação indevida
    if (!jwtCompanyId && headerCompanyId && !isAdminGlobal) {
      throw new ForbiddenException(); // SECURITY: impede forja de tenant via header
    }

    // SECURITY: Determina tenant efetivo: prioriza JWT; para Admin Geral, usa header se presente
    const tenantId =
      jwtCompanyId || (isAdminGlobal ? headerCompanyId : undefined);

    if (tenantId) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query('SET LOCAL app.current_company_id = $1', [
        tenantId,
      ]);

      return this.tenantService.run(
        tenantId,
        () =>
          tenantStorage.run({ manager: queryRunner.manager }, () => {
            res.on('finish', async () => {
              try {
                await queryRunner.commitTransaction();
              } catch {
                await queryRunner.rollbackTransaction();
              } finally {
                await queryRunner.release();
              }
            });
            next();
          }),
      );
    }

    // SECURITY: Sem tenant, segue sem contexto para evitar atribuição indevida
    return next();
  }
}
