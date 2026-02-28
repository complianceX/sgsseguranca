import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantService } from './tenant.service';
import { Role } from '../../auth/enums/roles.enum';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantService: TenantService,
    private readonly dataSource: DataSource,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { company_id: string; profile?: { nome: string } };
    }>();

    // In a real app, this would come from a JWT claim (user.company_id)
    // We check for 'x-tenant-id' or 'x-company-id' headers for development/testing
    let tenantId: string | undefined =
      request.headers['x-tenant-id'] ||
      request.headers['x-company-id'] ||
      request.user?.company_id;

    const user = request.user;
    // Se o usuário for Administrador Geral, ele não deve ser restrito a um tenant
    // a menos que um tenant específico tenha sido passado via header
    const isSuperAdmin = user?.profile?.nome === Role.ADMIN_GERAL;
    if (
      isSuperAdmin &&
      !request.headers['x-tenant-id'] &&
      !request.headers['x-company-id']
    ) {
      tenantId = undefined;
    }

    // Setar variáveis de sessão para RLS
    if (tenantId) {
      await this.dataSource.query('SET app.current_company_id = $1', [
        tenantId,
      ]);
    } else {
      await this.dataSource.query('RESET app.current_company_id');
    }

    // Setar variável de super admin
    await this.dataSource.query('SET app.is_super_admin = $1', [isSuperAdmin]);

    if (tenantId) {
      return this.tenantService.run(tenantId, () => next.handle());
    }
    return next.handle();
  }
}
