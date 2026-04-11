import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

const authFallbackBuckets = new Map<
  string,
  { count: number; resetAt: number }
>();
const authFallbackLogBuckets = new Map<string, number>();
type AuthFallbackPolicy = { limit: number; ttlMs: number };
type GuardRequest = Record<string, unknown> & {
  ip?: string;
  path?: string;
  url?: string;
  headers?: Record<string, unknown>;
};

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(IpThrottlerGuard.name);

  async canActivate(context: Parameters<ThrottlerGuard['canActivate']>[0]) {
    const http = context.switchToHttp();
    const req = http.getRequest<GuardRequest>();
    const path = String(req?.path || req?.url || '');
    const isDev = process.env.NODE_ENV !== 'production';
    const disableLoginThrottleInDev =
      process.env.DISABLE_LOGIN_THROTTLE_IN_DEV === 'true';

    // Em desenvolvimento, permite desabilitar throttle de login explicitamente.
    // Nunca dependa disso em ambientes expostos.
    if (isDev && disableLoginThrottleInDev && path.startsWith('/auth/login')) {
      return true;
    }

    try {
      return await this.runThrottlerWithTimeout(super.canActivate(context));
    } catch (error) {
      const failClosedOnAuthRoutes = this.shouldFailClosedOnAuthRoutes();
      const isCriticalAuthRoute = this.isCriticalAuthPath(path);

      if (failClosedOnAuthRoutes && isCriticalAuthRoute) {
        if (this.isAuthLocalFallbackEnabled()) {
          const allowed = await this.consumeAuthLocalFallback(req, path);
          if (allowed) {
            if (this.shouldEmitFallbackLog(`critical:${path}`)) {
              this.logger.warn(
                `IP throttler indisponível em rota crítica; aplicando fallback local limitado: ${path}`,
              );
            }
            return true;
          }
          throw new HttpException(
            'Muitas tentativas de autenticação. Tente novamente em instantes.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        this.logger.error(
          `IP throttler indisponível em rota crítica de autenticação: ${path}`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException(
          'Proteção de autenticação temporariamente indisponível. Tente novamente em instantes.',
        );
      }

      if (this.shouldEmitFallbackLog(`non-critical:${path}`)) {
        this.logger.warn(
          `IP throttler indisponível; aplicando fail-open para rota não crítica: ${path}`,
        );
      }
      return true;
    }
  }

  protected getTracker(req: GuardRequest): Promise<string> {
    const ip = String(req.ip || '');
    const path = String(req.path || req.url || '');
    const userAgentHeader = req.headers?.['user-agent'];
    const fingerprintHeader = req.headers?.['x-client-fingerprint'];
    const userAgent = (
      typeof userAgentHeader === 'string' ? userAgentHeader : ''
    ).slice(0, 200);
    const fingerprint = (
      typeof fingerprintHeader === 'string' ? fingerprintHeader : ''
    )
      .trim()
      .slice(0, 120);

    const includeFingerprint =
      path.startsWith('/public/') ||
      path.startsWith('/auth/login') ||
      path.startsWith('/auth/refresh');

    if (!includeFingerprint) {
      return Promise.resolve(ip);
    }

    const source = `${userAgent}:${fingerprint}`;
    const hashed = crypto
      .createHash('sha256')
      .update(source)
      .digest('hex')
      .slice(0, 16);
    return Promise.resolve(`${ip}:${hashed}`);
  }

  private shouldFailClosedOnAuthRoutes(): boolean {
    const raw = (
      process.env.THROTTLER_FAIL_CLOSED_AUTH_ROUTES ||
      (process.env.NODE_ENV === 'production' ? 'true' : 'false')
    )
      .trim()
      .toLowerCase();

    return raw === 'true';
  }

  private isAuthLocalFallbackEnabled(): boolean {
    const raw = (
      process.env.THROTTLER_AUTH_LOCAL_FALLBACK_ENABLED || 'true'
    ).trim();
    return raw.toLowerCase() === 'true';
  }

  private getAuthLocalFallbackLimit(): number {
    const parsed = Number(
      process.env.THROTTLER_AUTH_LOCAL_FALLBACK_LIMIT || 60,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 60;
    }
    return Math.min(Math.floor(parsed), 2000);
  }

  private getAuthMeLocalFallbackLimit(): number {
    const parsed = Number(
      process.env.THROTTLER_AUTH_ME_LOCAL_FALLBACK_LIMIT || 1200,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1200;
    }
    return Math.min(Math.floor(parsed), 20000);
  }

  private getAuthLocalFallbackTtlMs(): number {
    const parsed = Number(
      process.env.THROTTLER_AUTH_LOCAL_FALLBACK_TTL_MS || 60_000,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 60_000;
    }
    return Math.min(Math.floor(parsed), 300_000);
  }

  private getAuthMeLocalFallbackTtlMs(): number {
    const parsed = Number(
      process.env.THROTTLER_AUTH_ME_LOCAL_FALLBACK_TTL_MS || 60_000,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 60_000;
    }
    return Math.min(Math.floor(parsed), 300_000);
  }

  private getThrottlerDecisionTimeoutMs(): number {
    const parsed = Number(process.env.THROTTLER_DECISION_TIMEOUT_MS || 250);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 250;
    }
    return Math.min(Math.floor(parsed), 5000);
  }

  private getAuthFallbackLogCooldownMs(): number {
    const parsed = Number(
      process.env.THROTTLER_AUTH_FALLBACK_LOG_COOLDOWN_MS || 15_000,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 15_000;
    }
    return Math.min(Math.max(Math.floor(parsed), 1000), 300_000);
  }

  private async runThrottlerWithTimeout(
    decisionPromise: Promise<boolean>,
  ): Promise<boolean> {
    const timeoutMs = this.getThrottlerDecisionTimeoutMs();
    if (timeoutMs <= 0) {
      return decisionPromise;
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<boolean>([
        decisionPromise,
        new Promise<boolean>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`ip_throttler_timeout_after_${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async consumeAuthLocalFallback(
    req: GuardRequest,
    path: string,
  ): Promise<boolean> {
    const now = Date.now();
    const tracker = await this.getTracker(req);
    const key = `${path}:${tracker}`;
    const policy = this.resolveAuthFallbackPolicy(path);
    const ttlMs = policy.ttlMs;
    const limit = policy.limit;

    this.gcAuthFallbackBuckets(now);

    const bucket = authFallbackBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      authFallbackBuckets.set(key, {
        count: 1,
        resetAt: now + ttlMs,
      });
      return true;
    }

    bucket.count += 1;
    authFallbackBuckets.set(key, bucket);
    return bucket.count <= limit;
  }

  private resolveAuthFallbackPolicy(path: string): AuthFallbackPolicy {
    const normalized = this.normalizePath(path);
    if (normalized === '/auth/me') {
      return {
        limit: this.getAuthMeLocalFallbackLimit(),
        ttlMs: this.getAuthMeLocalFallbackTtlMs(),
      };
    }

    return {
      limit: this.getAuthLocalFallbackLimit(),
      ttlMs: this.getAuthLocalFallbackTtlMs(),
    };
  }

  private gcAuthFallbackBuckets(now: number): void {
    if (authFallbackBuckets.size < 50_000) {
      return;
    }

    for (const [key, value] of authFallbackBuckets.entries()) {
      if (value.resetAt <= now) {
        authFallbackBuckets.delete(key);
      }
    }
  }

  private shouldEmitFallbackLog(bucketKey: string): boolean {
    const normalizedPath = this.normalizePath(bucketKey);
    const now = Date.now();
    const cooldownMs = this.getAuthFallbackLogCooldownMs();
    const lastAt = authFallbackLogBuckets.get(normalizedPath);

    if (typeof lastAt === 'number' && now - lastAt < cooldownMs) {
      return false;
    }

    authFallbackLogBuckets.set(normalizedPath, now);
    this.gcAuthFallbackLogBuckets(now, cooldownMs);
    return true;
  }

  private gcAuthFallbackLogBuckets(now: number, cooldownMs: number): void {
    if (authFallbackLogBuckets.size < 5000) {
      return;
    }

    const gcBefore = now - cooldownMs * 2;
    for (const [key, timestamp] of authFallbackLogBuckets.entries()) {
      if (timestamp <= gcBefore) {
        authFallbackLogBuckets.delete(key);
      }
    }
  }

  private normalizePath(path: string): string {
    return path.split('?')[0].replace(/\/+$/, '') || '/';
  }

  private isCriticalAuthPath(path: string): boolean {
    const normalized = this.normalizePath(path);
    return (
      normalized === '/auth/login' ||
      normalized === '/auth/refresh' ||
      normalized === '/auth/me'
    );
  }
}
