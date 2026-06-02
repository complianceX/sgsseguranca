import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerValue = req.headers['x-request-id'];
    const requestId = Array.isArray(headerValue)
      ? (headerValue[0] ?? randomUUID())
      : (headerValue ?? randomUUID());
    const request = req as RequestWithId;

    // Add to request
    request.id = requestId;

    // Add to response headers
    res.setHeader('x-request-id', requestId);

    next();
  }
}
