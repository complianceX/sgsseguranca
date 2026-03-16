import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

export type DistributedLockHandle = {
  key: string;
  token: string;
};

@Injectable()
export class DistributedLockService {
  constructor(private readonly redisService: RedisService) {}

  async tryAcquire(
    name: string,
    ttlMs: number,
  ): Promise<DistributedLockHandle | null> {
    const key = this.buildKey(name);
    const token = randomUUID();
    const safeTtlMs = this.normalizeTtlMs(ttlMs);
    const result = (await this.redisService
      .getClient()
      .set(key, token, 'PX', safeTtlMs, 'NX')) as string | null;

    if (result !== 'OK') {
      return null;
    }

    return { key, token };
  }

  async release(
    handle: DistributedLockHandle | null | undefined,
  ): Promise<boolean> {
    if (!handle) {
      return false;
    }

    const released = (await this.redisService.getClient().eval(
      `
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
        return 0
      `,
      1,
      handle.key,
      handle.token,
    )) as number;

    return released === 1;
  }

  private buildKey(name: string): string {
    return name.startsWith('lock:') ? name : `lock:${name}`;
  }

  private normalizeTtlMs(ttlMs: number): number {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      return 30_000;
    }

    return Math.floor(ttlMs);
  }
}
