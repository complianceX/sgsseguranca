import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { CacheService } from '../cache/cache.service';
import {
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
} from '../decorators/cache-key.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheKeyMetadata = this.reflector.get<string | Function>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    if (!cacheKeyMetadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const args = [request.params, request.query, request.body];

    const cacheKey =
      typeof cacheKeyMetadata === 'function'
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
      tap(async (data) => {
        await this.cacheService.set(cacheKey, data, ttl);
      }),
    );
  }
}
