import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../cache/cache.service';
import {
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
} from '../decorators/cache-key.decorator';

type CacheKeyFactory = (
  params: unknown,
  query: unknown,
  body: unknown,
) => string;

type CacheRequest = Request & {
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
  body?: unknown;
};

const isCacheKeyFactory = (value: unknown): value is CacheKeyFactory =>
  typeof value === 'function';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const cacheKeyMetadata = this.reflector.get<string | CacheKeyFactory>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    if (!cacheKeyMetadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<CacheRequest>();
    const args: Parameters<CacheKeyFactory> = [
      request.params,
      request.query,
      request.body,
    ];

    const cacheKey = isCacheKeyFactory(cacheKeyMetadata)
      ? cacheKeyMetadata(...args)
      : cacheKeyMetadata;

    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    );

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached !== undefined) {
      return of(cached);
    }

    // Execute and cache result
    return next.handle().pipe(
      tap((data: unknown) => {
        void this.cacheService.set(cacheKey, data, ttl).catch((error) => {
          this.logger.warn(
            `Falha ao popular cache para chave ${cacheKey}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }),
    );
  }
}
