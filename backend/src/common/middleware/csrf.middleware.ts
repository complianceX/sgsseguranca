import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    // SECURITY: obtém token do cookie e do header sem logar valores sensíveis
    const cookieToken = (req.cookies || {})['csrf-token'];
    const headerToken = (req.headers['x-csrf-token'] as string) || '';

    // SECURITY: bloqueia métodos mutáveis se tokens não existirem ou não coincidirem
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      // SECURITY: resposta 403 evita CSRF sem revelar detalhes do token
      throw new ForbiddenException('CSRF token inválido');
    }

    next();
  }
}
