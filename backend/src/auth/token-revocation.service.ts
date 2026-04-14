import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT_AUTH } from '../common/redis/redis.constants';

@Injectable()
export class TokenRevocationService {
  // P1: usa tier AUTH (noeviction) — tokens de revogação nunca podem ser evictados
  constructor(@Inject(REDIS_CLIENT_AUTH) private readonly redis: Redis) {}

  private getKey(tokenId: string): string {
    return `revoked-token:${tokenId}`;
  }

  /**
   * Revoga um refresh token, impedindo seu uso futuro.
   * @param tokenId O JTI (JWT ID) do token a ser revogado.
   * @param expiresInSeconds O tempo de expiração do token, para que a chave no Redis expire automaticamente.
   */
  async revoke(tokenId: string, expiresInSeconds: number): Promise<void> {
    const key = this.getKey(tokenId);
    await this.redis.set(key, 'revoked', 'EX', expiresInSeconds);
  }

  /**
   * Verifica se um token foi revogado.
   * @param tokenId O JTI (JWT ID) do token a ser verificado.
   * @returns `true` se o token estiver na lista de revogação, `false` caso contrário.
   */
  async isRevoked(tokenId: string): Promise<boolean> {
    const key = this.getKey(tokenId);
    const result = await this.redis.get(key);
    return result === 'revoked';
  }
}
