import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

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

    // SECURITY: bloqueia métodos mutáveis se tokens não existirem ou não coincidirem
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      // SECURITY: resposta 403 evita CSRF sem revelar detalhes do token
      throw new ForbiddenException('CSRF token inválido');
    }

    next();
  }
}
