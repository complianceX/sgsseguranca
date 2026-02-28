import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { IdempotencyService } from './idempotency.service';
import { TenantService } from '../tenant/tenant.service';

/**
 * Interceptor global de idempotência.
 *
 * Ativado automaticamente quando o cliente envia o header X-Idempotency-Key
 * em requisições POST, PUT ou PATCH.
 *
 * Comportamento:
 * - Primeira request com a chave → processa normalmente e armazena resposta (24h)
 * - Request repetida com mesma chave → retorna resposta armazenada sem reprocessar
 * - Request concorrente com mesma chave → retorna 409 Conflict
 *
 * Uso pelo cliente:
 *   POST /reports/generate
 *   X-Idempotency-Key: uuid-gerado-pelo-cliente
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const idempotencyKey = request.headers['x-idempotency-key'] as
      | string
      | undefined;

    // Só aplica em métodos não-seguros com a header presente
    if (!idempotencyKey || !this.IDEMPOTENT_METHODS.has(request.method)) {
      return next.handle();
    }

    const tenantId = TenantService.currentTenantId();
    const { method, path } = request;

    // Usar from() para converter a Promise em Observable e encadear
    return from(
      this.idempotencyService.getRecord(tenantId, method, path, idempotencyKey),
    ).pipe(
      switchMap((existing) => {
        // Resposta já processada → retornar cache sem reprocessar
        if (existing?.status === 'completed') {
          this.logger.debug(
            `Idempotent response from cache: ${method} ${path} key=${idempotencyKey}`,
          );
          response.setHeader('X-Idempotent-Replayed', 'true');
          response.status(existing.statusCode ?? 200);
          return from(Promise.resolve(existing.body));
        }

        // Outra request ainda processando → 409 Conflict
        if (existing?.status === 'processing') {
          throw new ConflictException(
            'Uma requisição com esta chave de idempotência já está em processamento. Aguarde e tente novamente.',
          );
        }

        // Primeira vez → marcar como processing via SET NX
        return from(
          this.idempotencyService.markProcessing(
            tenantId,
            method,
            path,
            idempotencyKey,
          ),
        ).pipe(
          switchMap((acquired) => {
            if (!acquired) {
              // Outra instância ganhou a corrida
              throw new ConflictException(
                'Uma requisição com esta chave de idempotência já está em processamento.',
              );
            }

            return next.handle().pipe(
              tap({
                next: async (body) => {
                  // Salvar resposta de sucesso
                  await this.idempotencyService.saveResponse(
                    tenantId,
                    method,
                    path,
                    idempotencyKey,
                    response.statusCode,
                    body,
                  );
                },
                error: async () => {
                  // Em erro, remover a chave para permitir retry com a mesma chave
                  await this.idempotencyService.deleteRecord(
                    tenantId,
                    method,
                    path,
                    idempotencyKey,
                  );
                },
              }),
            );
          }),
        );
      }),
    );
  }
}
