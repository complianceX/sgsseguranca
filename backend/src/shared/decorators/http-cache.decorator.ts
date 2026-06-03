import { SetMetadata } from '@nestjs/common';

export const HTTP_CACHE_KEY = 'http_cache_options';

export interface HttpCacheOptions {
  /** `max-age` em segundos (cache do cliente/CDN). Default: 0. */
  maxAge?: number;
  /** `s-maxage` em segundos (cache compartilhado, ex.: CDN). */
  sMaxAge?: number;
  /** Visibilidade. `private` impede CDN/proxy de cachear — use para dados por usuário/tenant. */
  visibility?: 'public' | 'private' | 'no-store';
  /** `stale-while-revalidate` em segundos. */
  staleWhileRevalidate?: number;
  /**
   * Quando true, o `CacheControlHeadersInterceptor` calcula ETag sobre o
   * corpo da resposta e retorna 304 quando o cliente manda `If-None-Match`.
   */
  etag?: boolean;
}

/**
 * Adiciona headers `Cache-Control` e opcionalmente `ETag` em respostas
 * de rotas GET.
 *
 * Use com cuidado em rotas de dados de tenant/usuário — sempre
 * `visibility: 'private'` nesses casos.
 *
 * @example
 * // 60s de cache privado com revalidação condicional via ETag
 * @HttpCache({ maxAge: 60, visibility: 'private', etag: true })
 * @Get('export/excel')
 * async exportExcel() { ... }
 */
export const HttpCache = (options: HttpCacheOptions) =>
  SetMetadata(HTTP_CACHE_KEY, options);
