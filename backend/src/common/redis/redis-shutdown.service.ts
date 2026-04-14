import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  REDIS_CLIENT,
  REDIS_CLIENT_AUTH,
  REDIS_CLIENT_CACHE,
  REDIS_CLIENT_QUEUE,
} from './redis.constants';

@Injectable()
export class RedisShutdownService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly defaultClient: Redis,
    @Inject(REDIS_CLIENT_AUTH) private readonly authClient: Redis,
    @Inject(REDIS_CLIENT_CACHE) private readonly cacheClient: Redis,
    @Inject(REDIS_CLIENT_QUEUE) private readonly queueClient: Redis,
  ) {}

  onModuleDestroy(): void {
    const clients = [
      this.defaultClient,
      this.authClient,
      this.cacheClient,
      this.queueClient,
    ];

    for (const client of new Set(clients)) {
      const disconnect = (client as unknown as { disconnect?: () => void })
        .disconnect;
      if (typeof disconnect === 'function') {
        disconnect.call(client);
      }
    }
  }
}
