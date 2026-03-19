import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

function getCookieValue(request: Request, key: string): string {
  const cookies: unknown = Reflect.get(request, 'cookies');
  if (typeof cookies !== 'object' || cookies === null) {
    return '';
  }

  const value = (cookies as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
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
