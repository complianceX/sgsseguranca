import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class BruteForceService {
  private readonly logger = new Logger(BruteForceService.name);

  constructor(private readonly redisService: RedisService) {}

  private getMaxAttempts(): number {
    const v = Number(process.env.LOGIN_FAIL_MAX || 10);
    return Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 3), 50) : 10;
  }

  private getWindowSeconds(): number {
    const v = Number(process.env.LOGIN_FAIL_WINDOW_SECONDS || 900);
    return Number.isFinite(v)
      ? Math.min(Math.max(Math.floor(v), 60), 3600)
      : 900;
  }

  private getBlockSeconds(): number {
    const v = Number(process.env.LOGIN_FAIL_BLOCK_SECONDS || 900);
    return Number.isFinite(v)
      ? Math.min(Math.max(Math.floor(v), 60), 86400)
      : 900;
  }

  private keyCounter(ip: string) {
    return `auth:bf:ip:${ip}`;
  }

  private keyBlock(ip: string) {
    return `auth:bf:block:${ip}`;
  }

  async assertAllowed(tracker: string | null) {
    if (!tracker) {
      this.logger.error(
        'BruteForce: identificador do cliente indisponível — bloqueando tentativa de login (fail-closed)',
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Serviço temporariamente indisponível. Tente novamente.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Fail-closed: se o Redis estiver indisponível, bloquear o login.
    // Nunca permitir autenticação sem proteção ativa contra brute force.
    try {
      const client = this.redisService.getClient();
      const blocked = await client.get(this.keyBlock(tracker));
      if (blocked) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message:
              'Muitas tentativas de login. IP temporariamente bloqueado. Tente novamente em alguns minutos.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'BruteForce: Redis indisponível — bloqueando login por segurança (fail-closed)',
        err instanceof Error ? err.message : String(err),
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async registerFailure(tracker: string | null) {
    if (!tracker) {
      this.logger.error(
        'BruteForce: identificador do cliente indisponível — falha de login não pôde ser registrada',
      );
      return;
    }
    let client: ReturnType<typeof this.redisService.getClient>;
    try {
      client = this.redisService.getClient();
    } catch (err) {
      this.logger.error(
        'BruteForce: Redis indisponível — falha de login não registrada',
        err instanceof Error ? err.message : String(err),
      );
      return;
    }
    const key = this.keyCounter(tracker);
    const max = this.getMaxAttempts();
    const windowSeconds = this.getWindowSeconds();
    const blockSeconds = this.getBlockSeconds();

    // Lua script: INCR e EXPIRE na mesma operação atômica.
    // Garante que a chave NUNCA fique sem TTL mesmo em caso de crash
    // entre as duas operações — elimina risco de bloqueio permanente.
    const incrScript = `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
      end
      return count
    `;
    const count = (await client.eval(
      incrScript,
      1,
      key,
      String(windowSeconds),
    )) as number;

    if (count >= max) {
      await client
        .multi()
        .del(key)
        .set(this.keyBlock(tracker), '1', 'EX', blockSeconds)
        .exec();
    }
  }

  async reset(tracker: string | null) {
    if (!tracker) return;
    const client = this.redisService.getClient();
    await client.del(this.keyCounter(tracker), this.keyBlock(tracker));
  }
}
