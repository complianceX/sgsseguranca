import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { constantTimeEquals } from '../security/constant-time.util';

/**
 * Basic Auth para o dashboard /admin/queues (Bull Board).
 * Configura via env vars:
 *   BULL_BOARD_USER — usuário (default: "admin")
 *   BULL_BOARD_PASS — senha obrigatória em produção
 */
@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const isProduction = process.env.NODE_ENV === 'production';
    const password = process.env.BULL_BOARD_PASS;

    // Em produção sem senha configurada: bloquear completamente
    if (isProduction && !password) {
      res.status(503).json({
        error: 'Bull Board desabilitado: configure BULL_BOARD_PASS',
      });
      return;
    }

    // Sem senha configurada em dev: liberar sem auth
    if (!password) {
      return next();
    }

    const expectedUser = process.env.BULL_BOARD_USER || 'admin';
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
      res.status(401).json({ error: 'Autenticação necessária' });
      return;
    }

    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const [user, pass] = decoded.split(':');

    if (
      !constantTimeEquals(user, expectedUser) ||
      !constantTimeEquals(pass, password)
    ) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    next();
  }
}
