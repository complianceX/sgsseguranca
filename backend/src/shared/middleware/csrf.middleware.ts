import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

const CSRF_EXEMPT_PATH_PATTERNS: RegExp[] = [
  /^\/auth\/csrf\/?$/i,
  /^\/public\/dds\/signature\/[^/]+\/?$/i,
  /^\/tenant-lifecycle\/onboarding\/[^/]+\/complete\/?$/i,
];

function getCookieValue(request: Request, key: string): string {
  const cookies: unknown = Reflect.get(request, 'cookies');
  if (typeof cookies !== 'object' || cookies === null) {
    return '';
  }

  const value = (cookies as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function isCsrfExemptPath(path: string): boolean {
  const pathname = path.split('?')[0] || '';
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const versionlessPath = normalizedPath.replace(/^\/v\d+(?=\/)/, '');
  return CSRF_EXEMPT_PATH_PATTERNS.some(
    (pattern) => pattern.test(normalizedPath) || pattern.test(versionlessPath),
  );
}

function resolveRequestPath(req: Request): string {
  const candidates = [req.originalUrl, req.url, req.path];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return '';
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly logger = new Logger(CsrfMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    const requestPath = resolveRequestPath(req);
    if (isCsrfExemptPath(requestPath)) {
      return next();
    }

    // SECURITY: obtém token do cookie e do header sem logar valores sensíveis
    const cookieToken = getCookieValue(req, 'csrf-token');
    const headerValue = req.headers['x-csrf-token'];
    const headerToken = Array.isArray(headerValue)
      ? (headerValue[0] ?? '')
      : (headerValue ?? '');

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('CSRF token inválido');
    }

    const secret = this.configService.get<string>('CSRF_TOKEN_SECRET');

    if (secret) {
      // SECURITY: HMAC-SHA256 — cookie guarda rawToken, header deve trazer
      // HMAC(secret, rawToken). timingSafeEqual previne timing oracle.
      const expected = createHmac('sha256', secret)
        .update(cookieToken)
        .digest();
      let provided: Buffer;
      try {
        provided = Buffer.from(headerToken, 'hex');
      } catch {
        throw new ForbiddenException('CSRF token inválido');
      }
      if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided)
      ) {
        throw new ForbiddenException('CSRF token inválido');
      }
    } else {
      // Fallback para dev/test sem CSRF_TOKEN_SECRET configurado
      this.logger.warn(
        'CSRF_TOKEN_SECRET não configurado — usando double-submit simples. ' +
          'Configure CSRF_TOKEN_SECRET em produção.',
      );
      if (cookieToken !== headerToken) {
        throw new ForbiddenException('CSRF token inválido');
      }
    }

    next();
  }
}
