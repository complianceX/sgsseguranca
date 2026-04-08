import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export enum RiskType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  LOGIN_ATTEMPT = 'login_attempt',
  DATA_EXPORT = 'data_export',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Injectable()
export class PdfRateLimitService {
  private readonly logger = new Logger(PdfRateLimitService.name);
  private readonly RATE_LIMIT_WINDOW = 120; // 2 minutes in seconds
  private readonly MAX_DOWNLOADS = 50;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async checkDownloadLimit(userId: string, ip: string): Promise<void> {
    const key = `rate:pdf_download:${userId}`;
    let count: number;
    if (typeof (this.redis as { eval?: unknown }).eval !== 'function') {
      count = await this.redis.incr(key);
      const ttl = await this.redis.ttl(key);
      if (count === 1 || ttl < 0) {
        await this.redis.expire(key, this.RATE_LIMIT_WINDOW);
      }
    } else {
    const script = `
      local count = redis.call('INCR', KEYS[1])
      local ttl = redis.call('TTL', KEYS[1])
      if count == 1 or ttl < 0 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
        ttl = tonumber(ARGV[1])
      end
      return {count, ttl}
    `;
    const result = (await this.redis.eval(
      script,
      1,
      key,
      String(this.RATE_LIMIT_WINDOW),
    )) as [number, number];
      count = Number(result?.[0] ?? 0);
    }

    // Check if limit exceeded
    if (count > this.MAX_DOWNLOADS) {
      this.logger.warn(
        `User ${userId} exceeded PDF download limit: ${count} in 2 mins`,
      );

      // Register high risk event - MOCK for now
      this.logger.error(
        `HIGH RISK EVENT: Mass PDF Download Detected for user ${userId} at IP ${ip}`,
      );

      throw new Error(
        'Limite de downloads de PDF excedido. Atividade suspeita detectada.',
      );
    }
  }

  async getDownloadCount(userId: string): Promise<number> {
    const key = `rate:pdf_download:${userId}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }
}
