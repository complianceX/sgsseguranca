import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { trace } from '@opentelemetry/api';
import { requestContextStorage } from './request-context.middleware';

export type RequestWithSentryTrace = Request & { sentryTraceId?: string };

/**
 * Lê o header `sentry-trace` enviado pelo frontend e:
 * 1. Extrai o traceId (32 hex chars do formato `{traceId}-{spanId}-{sampled}`)
 * 2. Armazena no AsyncLocalStorage do RequestContext para uso em logs/serviços
 * 3. Injeta como atributo `sentry.trace_id` no span OpenTelemetry ativo (correlação Jaeger)
 *
 * Permite rastrear um erro capturado pelo Sentry até o request correspondente no Jaeger
 * e nos logs estruturados do backend.
 */
@Injectable()
export class SentryTraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const sentryTrace = req.headers['sentry-trace'] as string | undefined;
    const baggage = req.headers['baggage'] as string | undefined;

    if (sentryTrace) {
      // Formato Sentry: {traceId}-{spanId}-{sampled}
      // traceId = primeiros 32 chars hex
      const traceId = sentryTrace.split('-')[0] ?? '';

      if (traceId) {
        (req as RequestWithSentryTrace).sentryTraceId = traceId;

        const store = requestContextStorage.getStore();
        if (store) {
          store.set('sentryTraceId', traceId);
          if (baggage) {
            store.set('sentryBaggage', baggage);
          }
        }

        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
          activeSpan.setAttribute('sentry.trace_id', traceId);
          if (baggage) {
            activeSpan.setAttribute('sentry.baggage', baggage);
          }
        }
      }
    }

    next();
  }
}
