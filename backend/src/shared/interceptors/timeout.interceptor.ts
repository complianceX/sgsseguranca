import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const REQUEST_TIMEOUT_KEY = 'request_timeout_ms';

/**
 * Interceptor global de timeout.
 *
 * Cancela automaticamente requests que demoram mais que o limite configurado.
 * Evita que uma query lenta bloqueie o worker Node.js indefinidamente.
 *
 * Timeout padrão: 30 segundos (configurável via env REQUEST_TIMEOUT_MS)
 * Rotas de geração de PDF/relatório podem precisar de mais tempo —
 * use o decorator @RequestTimeout(ms) para sobrescrever por rota.
 *
 * Exemplos de rotas que precisam de override:
 *   @RequestTimeout(120_000) // 2 minutos para gerar PDF complexo
 *   @Post('generate')
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout: number;

  constructor(private readonly reflector: Reflector) {
    this.defaultTimeout = parseInt(
      process.env.REQUEST_TIMEOUT_MS || '30000',
      10,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Permite sobrescrever o timeout por rota/controller via metadado
    const routeTimeout = this.reflector.getAllAndOverride<number>(
      REQUEST_TIMEOUT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const ms = routeTimeout ?? this.defaultTimeout;

    return next.handle().pipe(
      timeout(ms),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `A requisição excedeu o tempo limite de ${ms / 1000}s.`,
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
