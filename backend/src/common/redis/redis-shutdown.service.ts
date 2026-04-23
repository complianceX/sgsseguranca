import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  REDIS_CLIENT,
  REDIS_CLIENT_AUTH,
  REDIS_CLIENT_CACHE,
  REDIS_CLIENT_QUEUE,
} from './redis.constants';

type ClosableRedisClient = Redis & {
  status?: string;
  quit?: () => Promise<unknown>;
  disconnect?: () => void;
};

@Injectable()
export class RedisShutdownService
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private shutdownPromise?: Promise<void>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly defaultClient: Redis,
    @Inject(REDIS_CLIENT_AUTH) private readonly authClient: Redis,
    @Inject(REDIS_CLIENT_CACHE) private readonly cacheClient: Redis,
    @Inject(REDIS_CLIENT_QUEUE) private readonly queueClient: Redis,
  ) {}

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.shutdown();
  }

  private shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.closeClients();
    }

    return this.shutdownPromise;
  }

  private async closeClients(): Promise<void> {
    const clients: ClosableRedisClient[] = [
      this.defaultClient,
      this.authClient,
      this.cacheClient,
      this.queueClient,
    ] as ClosableRedisClient[];

    await Promise.all(
      [...new Set(clients)].map(async (client) => {
        await this.closeClient(client);
      }),
    );
  }

  private async closeClient(client: ClosableRedisClient): Promise<void> {
    const quit = client.quit;
    const disconnect = client.disconnect;

    try {
      if (typeof quit === 'function' && client.status !== 'end') {
        await Promise.race([
          quit.call(client),
          new Promise((resolve) => setTimeout(resolve, 750)),
        ]);
      }
    } catch {
      // noop
    } finally {
      if (typeof disconnect === 'function') {
        disconnect.call(client);
      }
    }
  }
}
