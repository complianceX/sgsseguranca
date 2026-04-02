import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { Request } from 'express';

/**
 * Sistema de rate limiting resiliente com fail-closed em rotas críticas
 * Mantém proteção mesmo quando Redis está offline
 */
@Injectable()
export class ResilientThrottlerService {
    // Em-memory fallback para rotas críticas (fail-closed)
    private readonly inMemoryCounters = new Map<string, { count: number; resetTime: number }>();

    // Limites por tipo de rota
    private readonly rateLimits = {
        AUTH_ROUTES: { limit: 5, window: 60 * 1000 }, // 5 tentativas / minuto
        PUBLIC_VALIDATE: { limit: 10, window: 60 * 1000 }, // 10 tentativas / minuto  
        API_ROUTES: { limit: 100, window: 60 * 1000 }, // 100 req / minuto
        DASHBOARD: { limit: 50, window: 60 * 1000 }, // 50 req / minuto
    };

    constructor(private readonly redisService: RedisService) { }

    /**
     * Determinar tipo de rota (para escolher fail strategy)
     */
    private getRouteType(request: Request): string {
        const path = request.path.toLowerCase();

        if (path.includes('/auth/login') || path.includes('/auth/register')) {
            return 'AUTH_ROUTES'; // CRÍTICO
        }
        if (path.includes('/validate') || path.includes('/public')) {
            return 'PUBLIC_VALIDATE'; // CRÍTICO
        }
        if (path.includes('/dashboard')) {
            return 'DASHBOARD'; // IMPORTANTE
        }

        return 'API_ROUTES'; // NORMAL
    }

    /**
     * Verificar se requisição foi rate-limitada
     * Retorna { isBlocked, remainingTime }
     */
    async checkLimit(request: Request, identifier: string): Promise<{ isBlocked: boolean; remainingTime?: number }> {
        const routeType = this.getRouteType(request);
        const config = this.rateLimits[routeType];
        const key = `throttle:${routeType}:${identifier}`;

        try {
            // Tentar usar Redis primeiro (ideal)
            return await this.checkRateLimitRedis(key, config);
        } catch (redisError) {
            // Redis falhou - usar fallback conforme tipo de rota
            console.warn(`⚠️ Redis error on ${routeType}:`, redisError.message);

            if (routeType === 'AUTH_ROUTES' || routeType === 'PUBLIC_VALIDATE') {
                // ❌ FAIL-CLOSED em rotas críticas
                // Bloquear requisição para evitar brute-force
                throw new HttpException(
                    'Service temporarily unavailable. Please try again in a few minutes.',
                    HttpStatus.SERVICE_UNAVAILABLE,
                );
            }

            // ✅ FAIL-OPEN em rotas normais (cache em memória)
            return this.checkRateLimitInMemory(key, config);
        }
    }

    /**
     * Verificar rate limit via Redis (online)
     */
    private async checkRateLimitRedis(
        key: string,
        config: { limit: number; window: number }
    ): Promise<{ isBlocked: boolean; remainingTime?: number }> {
        const redis = this.redisService.getClient();
        const count = await redis.incr(key);
        const ttl = await redis.ttl(key);

        // Primeira requisição - set TTL
        if (count === 1) {
            await redis.expire(key, Math.ceil(config.window / 1000));
        }

        if (count > config.limit) {
            const remainingTime = (ttl || Math.ceil(config.window / 1000)) * 1000;
            return { isBlocked: true, remainingTime };
        }

        return { isBlocked: false };
    }

    /**
     * Fallback em memória (quando Redis está offline)
     * Apenas para rotas low-risk
     */
    private checkRateLimitInMemory(
        key: string,
        config: { limit: number; window: number }
    ): { isBlocked: boolean; remainingTime?: number } {
        const now = Date.now();
        const counter = this.inMemoryCounters.get(key);

        // Expirou? Reset
        if (!counter || now > counter.resetTime) {
            this.inMemoryCounters.set(key, { count: 1, resetTime: now + config.window });
            return { isBlocked: false };
        }

        counter.count++;

        if (counter.count > config.limit) {
            const remainingTime = counter.resetTime - now;
            return { isBlocked: true, remainingTime };
        }

        return { isBlocked: false };
    }

    /**
     * Reset manual (admin cleanup)
     */
    async resetLimit(identifier: string): Promise<void> {
        const redis = this.redisService.getClient();
        await redis.del(`throttle:AUTH_ROUTES:${identifier}`);
        await redis.del(`throttle:PUBLIC_VALIDATE:${identifier}`);
        await redis.del(`throttle:DASHBOARD:${identifier}`);
        await redis.del(`throttle:API_ROUTES:${identifier}`);
    }
}
