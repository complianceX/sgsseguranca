import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';

@Injectable()
export class CacheShutdownService
  implements OnModuleDestroy, BeforeApplicationShutdown
{
  private shutdownPromise?: Promise<void>;

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  beforeApplicationShutdown(): Promise<void> {
    return this.shutdown();
  }

  private shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.closeCache();
    }

    return this.shutdownPromise;
  }

  private async closeCache(): Promise<void> {
    if (typeof this.cacheManager.disconnect !== 'function') {
      return;
    }

    try {
      await this.cacheManager.disconnect();
    } catch {
      // noop
    }
  }
}
