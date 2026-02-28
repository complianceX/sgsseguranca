import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { TenantService } from '../tenant/tenant.service';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard global de rate limiting por tenant (company_id).
 *
 * - Protege o sistema contra abuso de um único tenant
 * - Responde com 429 Too Many Requests + headers informativos
 * - Rotas públicas (@Public()) são ignoradas
 *
 * O plano padrão é 'PROFESSIONAL'. Para planos diferenciados por tenant,
 * adicione o campo `plan` no JWT payload e passe via `request.user.plan`.
 */
@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  constructor(
    private readonly tenantService: TenantService,
    private readonly rateLimitService: TenantRateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const companyId = this.tenantService.getTenantId();

    // Sem tenant no contexto — deixa TenantRequiredGuard tratar
    if (!companyId) return true;

    const request = context.switchToHttp().getRequest();
    // Plano vem do JWT se disponível; fallback para 'PROFESSIONAL'
    const plan = (request.user?.plan as string) || 'PROFESSIONAL';

    const result = await this.rateLimitService.checkLimit(
      companyId,
      plan as any,
    );

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));
    response.setHeader('X-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      if (result.retryAfter) {
        response.setHeader('Retry-After', String(result.retryAfter));
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Limite de requisições excedido para esta empresa. Tente novamente em breve.',
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
