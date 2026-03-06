import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as crypto from 'crypto';
import { Request, Response } from 'express';

interface RequestWithUser extends Request {
  user?: {
    userId?: string;
    company_id?: string;
  };
  requestId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method;
    const url = request.url;
    const body = request.body as Record<string, unknown> | null;
    const headers = request.headers;
    const ip = request.ip || '';
    const userAgent = (headers['user-agent'] as string) || '';
    const requestId = crypto.randomUUID();
    const isAuthRoute = typeof url === 'string' && url.startsWith('/auth');

    // Adicionar requestId ao request para rastreamento
    request.requestId = requestId;

    const now = Date.now();

    // Log de entrada
    const baseLog = {
      type: 'REQUEST',
      requestId,
      method,
      url,
      ip,
      userAgent,
      userId: request.user?.userId,
      companyId: request.user?.company_id,
    } as Record<string, unknown>;

    // LGPD: não logar body em rotas /auth (credenciais/refresh/logout).
    if (!isAuthRoute) {
      baseLog.body = this.sanitizeBody(body as Record<string, unknown>);
    }

    this.logger.log(baseLog);

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - now;
          const response = context.switchToHttp().getResponse<Response>();

          this.logger.log({
            type: 'RESPONSE',
            requestId,
            method,
            url,
            statusCode: response.statusCode,
            responseTime: `${responseTime}ms`,
            userId: request.user?.userId,
          });
        },
        error: (error: Error) => {
          const responseTime = Date.now() - now;

          this.logger.error({
            type: 'ERROR',
            requestId,
            method,
            url,
            responseTime: `${responseTime}ms`,
            error: error.message,
            stack: error.stack,
            userId: request.user?.userId,
          });
        },
      }),
    );
  }

  private sanitizeBody(
    body: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!body) return body;

    return this.sanitizeUnknown(body, 0) as Record<string, unknown>;
  }

  private sanitizeUnknown(value: unknown, depth: number): unknown {
    if (depth > 6) return '***TRUNCATED***';

    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeUnknown(v, depth + 1));
    }

    if (value && typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(input)) {
        out[key] = this.sanitizeKeyValue(key, v, depth + 1);
      }
      return out;
    }

    if (typeof value === 'string') {
      return this.maskValue(value);
    }

    return value;
  }

  private sanitizeKeyValue(
    key: string,
    value: unknown,
    depth: number,
  ): unknown {
    const k = key.toLowerCase();

    const redactKeys = new Set([
      'password',
      'senha',
      'token',
      'access_token',
      'refresh_token',
      'authorization',
    ]);

    if (redactKeys.has(k)) return '***REDACTED***';

    if (k.includes('cpf')) {
      return typeof value === 'string' ? this.maskCpf(value) : '***MASKED***';
    }

    if (k.includes('email')) {
      return typeof value === 'string' ? this.maskEmail(value) : '***MASKED***';
    }

    return this.sanitizeUnknown(value, depth);
  }

  private maskValue(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;

    // Email heuristic
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return this.maskEmail(trimmed);
    }

    // CPF heuristic (11 digits with optional punctuation)
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11) {
      return this.maskCpf(trimmed);
    }

    // Prevent huge payloads in logs
    if (trimmed.length > 200) {
      return `${trimmed.slice(0, 200)}…`;
    }

    return trimmed;
  }

  private maskCpf(cpf: string): string {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return '***MASKED***';
    // 123.***.***-** (preserva apenas 3 primeiros)
    return `${digits.slice(0, 3)}.***.***-**`;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***MASKED***';
    const first = local?.[0] ?? '*';
    return `${first}***@${domain}`;
  }
}
