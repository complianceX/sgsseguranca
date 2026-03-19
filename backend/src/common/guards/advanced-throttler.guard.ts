import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { getRequestIp } from '../utils/request-ip.util';

interface ThrottledRequestUser {
  id?: string;
  userId?: string;
}

type ThrottledRequest = Request & {
  user?: ThrottledRequestUser;
};

const getRoutePath = (route: unknown): string | null => {
  if (typeof route !== 'object' || route === null || !('path' in route)) {
    return null;
  }

  const path = route.path;
  return typeof path === 'string' && path.length > 0 ? path : null;
};

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
    protected readonly options: ThrottlerModuleOptions,
    protected readonly storageService: ThrottlerStorage,
    protected readonly reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl, blockDuration, throttler } = requestProps;
    const request = context.switchToHttp().getRequest<ThrottledRequest>();

    // Identificadores para rate limiting
    const ip = this.getRequestIP(request);
    const userId = request.user?.id ?? request.user?.userId ?? 'anonymous';
    const routePath = getRoutePath(request.route);
    const endpoint = `${request.method}:${routePath ?? request.url}`;

    // Rate limiting por IP (mais permissivo)
    const ipKey = `throttle:ip:${ip}`;
    const ipLimit = limit * 10; // 10x mais permissivo para IP
    await this.checkLimit(ipKey, ipLimit, ttl, blockDuration, 'advanced-ip');

    // Rate limiting por usuário (mais restritivo)
    if (userId !== 'anonymous') {
      const userKey = `throttle:user:${userId}`;
      await this.checkLimit(
        userKey,
        limit,
        ttl,
        blockDuration,
        'advanced-user',
      );
    }

    // Rate limiting por endpoint específico
    const endpointKey = `throttle:endpoint:${userId}:${endpoint}`;
    await this.checkLimit(
      endpointKey,
      limit,
      ttl,
      blockDuration,
      throttler.name ?? 'advanced-endpoint',
    );

    return true;
  }

  private async checkLimit(
    key: string,
    limit: number,
    ttl: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<void> {
    const { totalHits } = await this.storageService.increment(
      key,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );

    if (totalHits > limit) {
      throw new ThrottlerException(
        `Rate limit exceeded. Try again in ${Math.ceil(ttl / 1000)} seconds.`,
      );
    }
  }

  private getRequestIP(request: ThrottledRequest): string {
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
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(...args: unknown[]) => unknown>,
  ) => {
    if (descriptor.value) {
      Reflect.defineMetadata(THROTTLE_CUSTOM_KEY, options, descriptor.value);
    }

    return descriptor;
  };
}
