import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response, Request } from 'express';
import {
  USER_THROTTLE_KEY,
  UserThrottleOptions,
} from '../decorators/user-throttle.decorator';
import { UserRateLimitService } from '../rate-limit/user-rate-limit.service';

type AuthedRequest = Request & {
  user?: { sub?: string; id?: string; userId?: string };
};

export const getUserRateLimitRoute = (request: Request): string => {
  const routeValue = request.route as { path?: unknown } | undefined;
  const routePath =
    typeof routeValue?.path === 'string'
      ? `${request.baseUrl || ''}${routeValue.path}`
      : request.path;

  return `${request.method}:${routePath}`;
};

/**
 * Guard de rate limit por usuário (user_id).
 *
 * Só atua em rotas decoradas com @UserThrottle({ requestsPerMinute: N }).
 * Deve ser aplicado após JwtAuthGuard (precisa de req.user).
 *
 * Responde 429 com header Retry-After se o limite for excedido.
 */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(UserRateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly userRateLimitService: UserRateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      UserThrottleOptions | undefined
    >(USER_THROTTLE_KEY, [context.getHandler(), context.getClass()]);

    if (!options) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const userId =
      request.user?.sub ?? request.user?.id ?? request.user?.userId;

    // Sem userId autenticado — JwtAuthGuard tratará a autenticação
    if (!userId) return true;

    const route = getUserRateLimitRoute(request);
    let result: Awaited<ReturnType<UserRateLimitService['checkLimit']>>;
    try {
      result = await this.userRateLimitService.checkLimit(
        userId,
        route,
        options.requestsPerMinute,
      );
    } catch (error) {
      // SECURITY: Never silently allow requests when Redis-backed user throttling is unhealthy.
      this.logger.error({
        event: 'user_rate_limit_storage_unavailable',
        userId,
        route,
        limit: options.requestsPerMinute,
        errorName: error instanceof Error ? error.name : 'UserRateLimitError',
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceUnavailableException(
        'Proteção de rate limit temporariamente indisponível. Tente novamente em instantes.',
      );
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader(
      'X-User-RateLimit-Limit',
      String(options.requestsPerMinute),
    );
    response.setHeader('X-User-RateLimit-Remaining', String(result.remaining));
    response.setHeader('X-User-RateLimit-Reset', String(result.resetAt));

    if (!result.allowed) {
      if (result.retryAfter !== undefined) {
        response.setHeader('Retry-After', String(result.retryAfter));
      }

      this.logger.warn({
        event: 'user_rate_limit_exceeded',
        userId,
        route,
        limit: options.requestsPerMinute,
        retryAfter: result.retryAfter,
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Limite de ${options.requestsPerMinute} requisições/minuto por usuário excedido. Aguarde ${result.retryAfter ?? 60}s antes de tentar novamente.`,
          retryAfter: result.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
