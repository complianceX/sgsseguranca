import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class BruteForceService {
  constructor(private readonly redisService: RedisService) {}

  private getMaxAttempts(): number {
    const v = Number(process.env.LOGIN_FAIL_MAX || 10);
    return Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 3), 50) : 10;
  }

  private getWindowSeconds(): number {
    const v = Number(process.env.LOGIN_FAIL_WINDOW_SECONDS || 900);
    return Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 60), 3600) : 900;
  }

  private getBlockSeconds(): number {
    const v = Number(process.env.LOGIN_FAIL_BLOCK_SECONDS || 900);
    return Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 60), 86400) : 900;
  }

  private keyCounter(ip: string) {
    return `auth:bf:ip:${ip}`;
  }

  private keyBlock(ip: string) {
    return `auth:bf:block:${ip}`;
  }

  async assertAllowed(ip: string) {
    if (!ip) return;
    const client = this.redisService.getClient();
    const blocked = await client.get(this.keyBlock(ip));
    if (blocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Muitas tentativas de login. IP temporariamente bloqueado. Tente novamente em alguns minutos.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async registerFailure(ip: string) {
    if (!ip) return;
    const client = this.redisService.getClient();
    const key = this.keyCounter(ip);
    const max = this.getMaxAttempts();
    const windowSeconds = this.getWindowSeconds();
    const blockSeconds = this.getBlockSeconds();

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSeconds);
    }

    if (count >= max) {
      await client.multi().del(key).set(this.keyBlock(ip), '1', 'EX', blockSeconds).exec();
    }
  }

  async reset(ip: string) {
    if (!ip) return;
    const client = this.redisService.getClient();
    await client.del(this.keyCounter(ip), this.keyBlock(ip));
  }
}

