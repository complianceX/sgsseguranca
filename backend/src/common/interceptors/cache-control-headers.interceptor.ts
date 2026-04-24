import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import {
  HTTP_CACHE_KEY,
  HttpCacheOptions,
} from '../decorators/http-cache.decorator';

/**
 * Aplica `Cache-Control` (e opcionalmente `ETag` + 304) em rotas decoradas
 * com `@HttpCache({...})`. Só atua em requests `GET`.
 *
 * Este interceptor é seguro para respostas `StreamableFile`: pula o
 * ETag nesse caso para não bufferizar o stream.
 */
@Injectable()
export class CacheControlHeadersInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<HttpCacheOptions>(
      HTTP_CACHE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next.handle();
    }

    const cacheControl = buildCacheControlHeader(options);
    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }

    if (!options.etag) {
      return next.handle();
    }

    return next.handle().pipe(
      map((body: unknown) => {
        if (body instanceof StreamableFile) {
          return body;
        }

        const etag = computeEtag(body);
        if (!etag) {
          return body;
        }

        res.setHeader('ETag', etag);
        const ifNoneMatch = req.headers['if-none-match'];
        if (
          typeof ifNoneMatch === 'string' &&
          ifNoneMatch.split(',').map((v) => v.trim()).includes(etag)
        ) {
          res.status(304);
          return undefined;
        }
        return body;
      }),
    );
  }
}

function buildCacheControlHeader(options: HttpCacheOptions): string | null {
  if (options.visibility === 'no-store') {
    return 'no-store';
  }

  const parts: string[] = [];
  parts.push(options.visibility ?? 'private');
  if (typeof options.maxAge === 'number' && options.maxAge >= 0) {
    parts.push(`max-age=${Math.floor(options.maxAge)}`);
  }
  if (typeof options.sMaxAge === 'number' && options.sMaxAge >= 0) {
    parts.push(`s-maxage=${Math.floor(options.sMaxAge)}`);
  }
  if (
    typeof options.staleWhileRevalidate === 'number' &&
    options.staleWhileRevalidate >= 0
  ) {
    parts.push(
      `stale-while-revalidate=${Math.floor(options.staleWhileRevalidate)}`,
    );
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function computeEtag(body: unknown): string | null {
  if (body === undefined || body === null) {
    return null;
  }
  try {
    const serialized =
      typeof body === 'string' ? body : JSON.stringify(body);
    if (!serialized) {
      return null;
    }
    const hash = createHash('sha1').update(serialized).digest('base64');
    return `W/"${hash}"`;
  } catch {
    return null;
  }
}
