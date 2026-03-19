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

type TenantRateLimitPlan = Parameters<TenantRateLimitService['checkLimit']>[1];
type TenantRateLimitRequest = {
  user?: {
    plan?: string;
  };
};

const RATE_LIMIT_PLANS = new Set<TenantRateLimitPlan>([
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
]);

const getTenantPlan = (
  request: TenantRateLimitRequest,
): TenantRateLimitPlan => {
  const plan = request.user?.plan;
  return plan && RATE_LIMIT_PLANS.has(plan as TenantRateLimitPlan)
    ? (plan as TenantRateLimitPlan)
    : 'PROFESSIONAL';
};

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

    // Sem tenant no contexto — deixa TenantGuard tratar
    if (!companyId) return true;

    const request = context.switchToHttp().getRequest<TenantRateLimitRequest>();
    const plan = getTenantPlan(request);

    const result = await this.rateLimitService.checkLimit(companyId, plan);

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
