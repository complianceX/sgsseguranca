import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { SecurityAuditService } from './security-audit.service';

export const SENSITIVE_ACTION_KEY = 'sensitive_action';

/**
 * Decorator: marks an endpoint as requiring step-up authentication.
 * The client must include `X-Step-Up-Token` header with a valid token
 * obtained from `POST /auth/confirm-password`.
 */
export const SensitiveAction = (reason: string) =>
  SetMetadata(SENSITIVE_ACTION_KEY, reason);

@Injectable()
export class SensitiveActionGuard implements CanActivate {
  private readonly logger = new Logger(SensitiveActionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reason = this.reflector.getAllAndOverride<string | undefined>(
      SENSITIVE_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @SensitiveAction decorator, allow through
    if (!reason) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Autenticação necessária');
    }

    const stepUpToken = request.headers['x-step-up-token'] as
      | string
      | undefined;
    if (!stepUpToken) {
      throw new ForbiddenException({
        error: 'STEP_UP_REQUIRED',
        message:
          'Operação sensível requer confirmação de senha. Obtenha um token via POST /auth/confirm-password.',
        reason,
      });
    }

    const redisKey = `stepup:${userId}:${stepUpToken}`;
    const stored = await this.redis.get(redisKey);

    if (!stored) {
      this.securityAudit.stepUpFailed(userId, reason);
      throw new ForbiddenException({
        error: 'STEP_UP_INVALID',
        message: 'Token de confirmação inválido ou expirado.',
        reason,
      });
    }

    // Single-use: consume the token
    await this.redis.del(redisKey);

    this.securityAudit.stepUpVerified(userId);
    return true;
  }
}
