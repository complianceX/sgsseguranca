import {
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT_CACHE } from '../redis/redis.constants';
import { MetricsService } from '../observability/metrics.service';
import {
  extractResilienceErrorCode,
  extractResilienceErrorMessage,
} from './resilience-error.util';

export enum OpenAiCircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export type OpenAiFailureInput = {
  status?: number;
  error?: unknown;
};

type BreakerRedisState = {
  state: OpenAiCircuitBreakerState;
  consecutiveFailures: number;
  firstFailureAt: number;
  openedAt: number;
};

const OPENAI_BREAKER_KEY = 'circuit_breaker:openai';
const OPENAI_BREAKER_PROBE_LOCK_KEY = 'circuit_breaker:openai:half_open_probe';
const OPENAI_BREAKER_TRIPS_KEY = 'circuit_breaker:openai:trips';
const BREAKER_STATE_TTL_SECONDS = 3600;
const FAILURE_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 60_000;
const OPEN_COOLDOWN_MS = 30_000;
const TRIP_ALERT_WINDOW_MS = 60 * 60 * 1000;
const TRIP_ALERT_THRESHOLD = 3;

const OPEN_MESSAGE =
  'Serviço de IA temporariamente indisponível. Tente novamente em alguns instantes.';

const REDIS_SET_OK = 'OK';

@Injectable()
export class OpenAiCircuitBreakerService {
  private readonly logger = new Logger(OpenAiCircuitBreakerService.name);
  private localState: BreakerRedisState = {
    state: OpenAiCircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
    firstFailureAt: 0,
    openedAt: 0,
  };
  private localProbeLockExpiresAt = 0;
  private localTrips: number[] = [];

  constructor(
    @Inject(REDIS_CLIENT_CACHE) private readonly redis: Redis,
    private readonly metricsService: MetricsService,
  ) {
    this.metricsService.recordOpenAiCircuitBreakerState(
      OpenAiCircuitBreakerState.CLOSED,
    );
  }

  async assertRequestAllowed(): Promise<void> {
    try {
      await this.assertRequestAllowedWithMode('redis');
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.warn(
        `[OpenAI CB] Redis indisponível em assertRequestAllowed; usando fallback local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.assertRequestAllowedWithMode('local');
    }
  }

  async recordSuccess(): Promise<void> {
    try {
      await this.recordSuccessWithMode('redis');
    } catch (error) {
      this.logger.warn(
        `[OpenAI CB] Falha ao registrar sucesso no Redis; usando fallback local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.recordSuccessWithMode('local');
    }
  }

  async recordFailure(input: OpenAiFailureInput): Promise<void> {
    try {
      await this.recordFailureWithMode('redis', input);
    } catch (error) {
      this.logger.warn(
        `[OpenAI CB] Falha ao registrar erro no Redis; usando fallback local: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.recordFailureWithMode('local', input);
    }
  }

  isCountableFailureStatus(status: number): boolean {
    return status === 500 || status === 502 || status === 503;
  }

  isCountableFailureError(error: unknown): boolean {
    if (error instanceof GatewayTimeoutException) {
      return true;
    }

    const code = String(extractResilienceErrorCode(error) || '').toUpperCase();
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'UND_ERR_HEADERS_TIMEOUT' ||
      code === 'UND_ERR_BODY_TIMEOUT'
    ) {
      return true;
    }

    const message = String(
      extractResilienceErrorMessage(error) || '',
    ).toLowerCase();
    return (
      message.includes('timed out') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('connection refused')
    );
  }

  async getState(): Promise<OpenAiCircuitBreakerState> {
    try {
      return (await this.readState('redis')).state;
    } catch {
      return (await this.readState('local')).state;
    }
  }

  private async assertRequestAllowedWithMode(
    mode: 'redis' | 'local',
  ): Promise<void> {
    const now = Date.now();
    const current = await this.readState(mode);

    if (current.state === OpenAiCircuitBreakerState.CLOSED) {
      return;
    }

    if (current.state === OpenAiCircuitBreakerState.OPEN) {
      const cooldownElapsed = now - current.openedAt >= OPEN_COOLDOWN_MS;
      if (!cooldownElapsed) {
        throw new ServiceUnavailableException(OPEN_MESSAGE);
      }

      const lockAcquired = await this.acquireHalfOpenProbeLock(mode);
      if (!lockAcquired) {
        throw new ServiceUnavailableException(OPEN_MESSAGE);
      }

      await this.transitionState(
        mode,
        OpenAiCircuitBreakerState.OPEN,
        OpenAiCircuitBreakerState.HALF_OPEN,
        `cooldown de ${OPEN_COOLDOWN_MS / 1000}s finalizado`,
      );
      return;
    }

    const probeLock = await this.acquireHalfOpenProbeLock(mode);
    if (!probeLock) {
      throw new ServiceUnavailableException(OPEN_MESSAGE);
    }
  }

  private async recordSuccessWithMode(mode: 'redis' | 'local'): Promise<void> {
    const current = await this.readState(mode);
    if (current.state === OpenAiCircuitBreakerState.HALF_OPEN) {
      await this.releaseHalfOpenProbeLock(mode);
      await this.transitionState(
        mode,
        OpenAiCircuitBreakerState.HALF_OPEN,
        OpenAiCircuitBreakerState.CLOSED,
        'request de teste bem-sucedido',
      );
      return;
    }

    if (current.state === OpenAiCircuitBreakerState.CLOSED) {
      await this.writeState(
        {
          state: OpenAiCircuitBreakerState.CLOSED,
          consecutiveFailures: 0,
          firstFailureAt: 0,
          openedAt: 0,
        },
        mode,
      );
    }
  }

  private async recordFailureWithMode(
    mode: 'redis' | 'local',
    input: OpenAiFailureInput,
  ): Promise<void> {
    const current = await this.readState(mode);
    const now = Date.now();

    if (current.state === OpenAiCircuitBreakerState.HALF_OPEN) {
      await this.releaseHalfOpenProbeLock(mode);
      await this.writeState(
        {
          state: OpenAiCircuitBreakerState.OPEN,
          consecutiveFailures: 0,
          firstFailureAt: 0,
          openedAt: now,
        },
        mode,
      );
      await this.onStateTransition(
        mode,
        OpenAiCircuitBreakerState.HALF_OPEN,
        OpenAiCircuitBreakerState.OPEN,
        'request de teste falhou',
        true,
      );
      return;
    }

    if (current.state === OpenAiCircuitBreakerState.OPEN) {
      return;
    }

    const withinWindow =
      current.firstFailureAt > 0 &&
      now - current.firstFailureAt <= FAILURE_WINDOW_MS;
    const nextConsecutiveFailures = withinWindow
      ? current.consecutiveFailures + 1
      : 1;
    const nextFirstFailureAt = withinWindow ? current.firstFailureAt : now;

    if (nextConsecutiveFailures >= FAILURE_THRESHOLD) {
      await this.writeState(
        {
          state: OpenAiCircuitBreakerState.OPEN,
          consecutiveFailures: 0,
          firstFailureAt: 0,
          openedAt: now,
        },
        mode,
      );
      await this.onStateTransition(
        mode,
        OpenAiCircuitBreakerState.CLOSED,
        OpenAiCircuitBreakerState.OPEN,
        `${FAILURE_THRESHOLD} falhas consecutivas em ${FAILURE_WINDOW_MS / 1000}s`,
        true,
      );
      return;
    }

    await this.writeState(
      {
        state: OpenAiCircuitBreakerState.CLOSED,
        consecutiveFailures: nextConsecutiveFailures,
        firstFailureAt: nextFirstFailureAt,
        openedAt: 0,
      },
      mode,
    );

    this.logger.warn(
      `[OpenAI CB] falha registrada (${nextConsecutiveFailures}/${FAILURE_THRESHOLD})`,
      {
        status: input.status,
        reason: this.summarizeError(input.error),
      },
    );
  }

  private async transitionState(
    mode: 'redis' | 'local',
    expectedFrom: OpenAiCircuitBreakerState,
    to: OpenAiCircuitBreakerState,
    reason: string,
  ): Promise<void> {
    const current = await this.readState(mode);
    if (current.state !== expectedFrom) {
      return;
    }

    await this.writeState(
      {
        state: to,
        consecutiveFailures: 0,
        firstFailureAt: 0,
        openedAt: to === OpenAiCircuitBreakerState.OPEN ? Date.now() : 0,
      },
      mode,
    );

    await this.onStateTransition(
      mode,
      expectedFrom,
      to,
      reason,
      to === OpenAiCircuitBreakerState.OPEN,
    );
  }

  private async onStateTransition(
    mode: 'redis' | 'local',
    from: OpenAiCircuitBreakerState,
    to: OpenAiCircuitBreakerState,
    reason: string,
    incrementTrip: boolean,
  ): Promise<void> {
    this.logger.warn(`OpenAI Circuit Breaker: ${from} → ${to} (${reason})`);
    this.metricsService.recordOpenAiCircuitBreakerState(to);
    if (incrementTrip) {
      this.metricsService.incrementOpenAiCircuitBreakerTrips();
      await this.trackTripsAndAlertIfNeeded(mode);
    }
  }

  private async acquireHalfOpenProbeLock(
    mode: 'redis' | 'local',
  ): Promise<boolean> {
    if (mode === 'local') {
      const now = Date.now();
      if (this.localProbeLockExpiresAt > now) {
        return false;
      }

      this.localProbeLockExpiresAt = now + OPEN_COOLDOWN_MS;
      return true;
    }

    const result = await this.redis.set(
      OPENAI_BREAKER_PROBE_LOCK_KEY,
      '1',
      'PX',
      OPEN_COOLDOWN_MS,
      'NX',
    );
    return result === REDIS_SET_OK;
  }

  private async releaseHalfOpenProbeLock(
    mode: 'redis' | 'local',
  ): Promise<void> {
    if (mode === 'local') {
      this.localProbeLockExpiresAt = 0;
      return;
    }

    await this.redis.del(OPENAI_BREAKER_PROBE_LOCK_KEY);
  }

  private async readState(mode: 'redis' | 'local'): Promise<BreakerRedisState> {
    if (mode === 'local') {
      return { ...this.localState };
    }

    const raw = await this.redis.hgetall(OPENAI_BREAKER_KEY);
    const state = this.normalizeState(raw.state);
    return {
      state,
      consecutiveFailures: this.toPositiveInt(raw.consecutiveFailures),
      firstFailureAt: this.toPositiveInt(raw.firstFailureAt),
      openedAt: this.toPositiveInt(raw.openedAt),
    };
  }

  private async writeState(
    next: BreakerRedisState,
    mode: 'redis' | 'local',
  ): Promise<void> {
    if (mode === 'local') {
      this.localState = { ...next };
      return;
    }

    await this.redis.hset(OPENAI_BREAKER_KEY, {
      state: next.state,
      consecutiveFailures: String(next.consecutiveFailures),
      firstFailureAt: String(next.firstFailureAt),
      openedAt: String(next.openedAt),
      updatedAt: String(Date.now()),
    });
    await this.redis.expire(OPENAI_BREAKER_KEY, BREAKER_STATE_TTL_SECONDS);
  }

  private async trackTripsAndAlertIfNeeded(
    mode: 'redis' | 'local',
  ): Promise<void> {
    const now = Date.now();
    const minTimestamp = now - TRIP_ALERT_WINDOW_MS;
    let tripsLastHour = 0;

    if (mode === 'local') {
      this.localTrips = this.localTrips
        .filter((timestamp) => timestamp > minTimestamp)
        .concat(now);
      tripsLastHour = this.localTrips.length;
    } else {
      const uniqueMember = `${now}:${Math.random().toString(36).slice(2, 10)}`;
      await this.redis.zadd(OPENAI_BREAKER_TRIPS_KEY, now, uniqueMember);
      await this.redis.zremrangebyscore(
        OPENAI_BREAKER_TRIPS_KEY,
        0,
        minTimestamp,
      );
      await this.redis.expire(
        OPENAI_BREAKER_TRIPS_KEY,
        Math.ceil(TRIP_ALERT_WINDOW_MS / 1000) * 2,
      );

      tripsLastHour = await this.redis.zcard(OPENAI_BREAKER_TRIPS_KEY);
    }

    if (tripsLastHour > TRIP_ALERT_THRESHOLD) {
      this.logger.error({
        alert: 'OPENAI_CIRCUIT_BREAKER_FLAPPING',
        threshold: TRIP_ALERT_THRESHOLD,
        tripsLastHour,
        windowMinutes: TRIP_ALERT_WINDOW_MS / 60_000,
        action:
          'Verificar latência/erros da OpenAI e considerar failover, redução de carga ou ajuste de timeout/retry.',
      });
    }
  }

  private normalizeState(raw: string | undefined): OpenAiCircuitBreakerState {
    if (raw === OpenAiCircuitBreakerState.OPEN) {
      return OpenAiCircuitBreakerState.OPEN;
    }
    if (raw === OpenAiCircuitBreakerState.HALF_OPEN) {
      return OpenAiCircuitBreakerState.HALF_OPEN;
    }
    return OpenAiCircuitBreakerState.CLOSED;
  }

  private toPositiveInt(raw: string | undefined): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private summarizeError(error: unknown): string | null {
    if (!error) return null;
    const message = extractResilienceErrorMessage(error);
    const code = extractResilienceErrorCode(error);
    return [message, code ? `code=${code}` : null].filter(Boolean).join(' ');
  }
}

export function isOpenAiCircuitBreakerUnavailableError(
  error: unknown,
): boolean {
  if (!(error instanceof ServiceUnavailableException)) {
    return false;
  }

  const response = error.getResponse();
  let message = '';
  if (typeof response === 'string') {
    message = response;
  } else if (response && typeof response === 'object') {
    const maybeMessage = (response as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      message = maybeMessage;
    } else if (Array.isArray(maybeMessage)) {
      message = maybeMessage
        .filter((item): item is string => typeof item === 'string')
        .join(' ');
    }
  }

  return message.includes('Serviço de IA temporariamente indisponível');
}
