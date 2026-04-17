import {
  CanActivate,
  Inject,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { REDIS_CLIENT_AUTH } from '../redis/redis.constants';
import { SecurityAuditService } from './security-audit.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getMfaJwtSecret } from '../../auth/mfa.config';

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
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT_AUTH) private readonly redis: Redis,
    private readonly securityAudit: SecurityAuditService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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
    const rawJti =
      request.user && 'jti' in request.user
        ? (request.user as Record<string, unknown>).jti
        : undefined;
    const accessJti =
      typeof rawJti === 'string' && rawJti.trim() ? rawJti : undefined;
    if (!stepUpToken) {
      throw new ForbiddenException({
        error: 'STEP_UP_REQUIRED',
        message:
          'Operação sensível requer MFA de step-up. Obtenha um token via POST /auth/step-up/verify.',
        reason,
      });
    }

    let payload: {
      sub?: string;
      purpose?: string;
      reason?: string;
      jti?: string;
      accessJti?: string;
    };
    try {
      payload = await this.jwtService.verifyAsync(stepUpToken, {
        secret: getMfaJwtSecret(this.configService),
      });
    } catch {
      this.securityAudit.stepUpFailed(userId, 'invalid_token');
      throw new ForbiddenException({
        error: 'STEP_UP_INVALID',
        message: 'Token de confirmação inválido ou expirado.',
        reason,
      });
    }

    if (
      payload.sub !== userId ||
      payload.purpose !== 'step_up' ||
      payload.reason !== reason ||
      !payload.jti
    ) {
      this.securityAudit.stepUpFailed(userId, 'token_mismatch');
      throw new ForbiddenException({
        error: 'STEP_UP_INVALID',
        message: 'Token de confirmação não corresponde à operação.',
        reason,
      });
    }

    const stored = await this.redis.eval(
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      `mfa:step-up:${payload.jti}`,
    );

    if (typeof stored !== 'string' || !stored) {
      this.securityAudit.stepUpFailed(userId, reason);
      throw new ForbiddenException({
        error: 'STEP_UP_INVALID',
        message: 'Token de confirmação inválido ou expirado.',
        reason,
      });
    }

    let state:
      | {
          userId: string;
          reason: string;
          accessJti?: string;
          method?: string;
        }
      | undefined;
    try {
      state = JSON.parse(stored) as {
        userId: string;
        reason: string;
        accessJti?: string;
        method?: string;
      };
    } catch {
      throw new ForbiddenException('Token de confirmação inválido');
    }

    if (
      state.userId !== userId ||
      state.reason !== reason ||
      (state.accessJti && accessJti && state.accessJti !== accessJti)
    ) {
      this.securityAudit.stepUpFailed(userId, 'state_mismatch');
      throw new ForbiddenException({
        error: 'STEP_UP_INVALID',
        message: 'Token de confirmação não corresponde à sessão atual.',
        reason,
      });
    }

    this.securityAudit.stepUpVerified(userId, reason, state.method);
    return true;
  }
}
