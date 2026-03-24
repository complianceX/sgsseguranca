import { SetMetadata } from '@nestjs/common';

export const USER_THROTTLE_KEY = 'user_throttle';

export interface UserThrottleOptions {
  /** Máximo de requisições por minuto por user_id. */
  requestsPerMinute: number;
}

/**
 * Aplica rate limit por usuário (user_id) em um endpoint.
 * Lido pelo UserRateLimitGuard — deve ser usado junto com JwtAuthGuard.
 *
 * @example
 *   @UserThrottle({ requestsPerMinute: 10 })
 *   @Post('chat')
 *   async chat() { ... }
 */
export const UserThrottle = (options: UserThrottleOptions) =>
  SetMetadata(USER_THROTTLE_KEY, options);
