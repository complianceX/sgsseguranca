import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { getRequestIp } from '../utils/request-ip.util';

/**
 * Advanced Throttler Guard com rate limiting por:
 * - IP
 * - Usuário
 * - Endpoint específico
 * - Tipo de operação
 */
@Injectable()
export class AdvancedThrottlerGuard extends ThrottlerGuard {
  constructor(
    protected readonly options: any,
    protected readonly storageService: any,
    protected readonly reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl } = requestProps;
    const request = context.switchToHttp().getRequest();

    // Identificadores para rate limiting
    const ip = this.getRequestIP(request);
    const userId = request.user?.id || 'anonymous';
    const endpoint = `${request.method}:${request.route?.path || request.url}`;

    // Rate limiting por IP (mais permissivo)
    const ipKey = `throttle:ip:${ip}`;
    const ipLimit = limit * 10; // 10x mais permissivo para IP
    await this.checkLimit(ipKey, ipLimit, ttl);

    // Rate limiting por usuário (mais restritivo)
    if (userId !== 'anonymous') {
      const userKey = `throttle:user:${userId}`;
      await this.checkLimit(userKey, limit, ttl);
    }

    // Rate limiting por endpoint específico
    const endpointKey = `throttle:endpoint:${userId}:${endpoint}`;
    await this.checkLimit(endpointKey, limit, ttl);

    return true;
  }

  private async checkLimit(
    key: string,
    limit: number,
    ttl: number,
  ): Promise<void> {
    const { totalHits } = await this.storageService.increment(key, ttl);

    if (totalHits > limit) {
      throw new ThrottlerException(
        `Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds.`,
      );
    }
  }

  private getRequestIP(request: any): string {
    return getRequestIp(request) || 'unknown';
  }
}

/**
 * Decorator para rate limiting customizado por endpoint
 */
export const THROTTLE_CUSTOM_KEY = 'throttle_custom';

export interface ThrottleCustomOptions {
  limit: number;
  ttl: number;
  message?: string;
}

export function ThrottleCustom(options: ThrottleCustomOptions) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(THROTTLE_CUSTOM_KEY, options, descriptor.value);
    return descriptor;
  };
}
