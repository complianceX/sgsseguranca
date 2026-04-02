import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Response } from 'express';
import { ResilientThrottlerService } from './resilient-throttler.service';

/**
 * Interceptor de Rate Limiting Resiliente
 * Pode ser aplicado em rotas específicas:
 * 
 * @UseInterceptors(ResilientThrottlerInterceptor)
 * @Post('auth/login')
 * async login() { ... }
 */
@Injectable()
export class ResilientThrottlerInterceptor implements NestInterceptor {
    constructor(private readonly throttlerService: ResilientThrottlerService) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        const request = context.switchToHttp().getRequest();

        // Extrair identificador do cliente (IP, user ID, etc)
        const identifier = this.getClientIdentifier(request);

        // Verificar se foi rate-limitado
        const result = await this.throttlerService.checkLimit(request, identifier);

        if (result.isBlocked) {
            const response = context.switchToHttp().getResponse<Response>();
            const retryAfter = Math.ceil((result.remainingTime || 60000) / 1000);

            response.setHeader('Retry-After', retryAfter.toString());
            response.setHeader('X-RateLimit-Remaining', '0');

            throw new HttpException({
                statusCode: 429,
                message: 'Too many requests, please try again later',
                retryAfter,
            }, HttpStatus.TOO_MANY_REQUESTS);
        }

        // Requisição OK - prosseguir
        return next.handle();
    }

    /**
     * Extrair identificador do cliente (IP + User ID se autenticado)
     */
    private getClientIdentifier(request: any): string {
        // Usar User ID se autenticado (mais acurado que IP)
        if (request.user?.id) {
            return `user:${request.user.id}`;
        }

        // Fallback: IP do cliente
        const ip =
            request.headers['x-forwarded-for']?.split(',')[0] ||
            request.connection.remoteAddress;

        return `ip:${ip}`;
    }
}
