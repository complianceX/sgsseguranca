import { RedisService } from './redis.service';
import { InMemoryRedis } from './redis.provider';

describe('RedisService with InMemoryRedis', () => {
  it('enforceMaxSessions funciona no modo degradado em memória', async () => {
    const client = new InMemoryRedis();
    const service = new RedisService(client as never);

    await service.storeRefreshToken('user-1', 'token-a', 60, '1');
    await service.storeRefreshToken('user-1', 'token-b', 120, '1');
    await service.storeRefreshToken('user-1', 'token-c', 180, '1');

    const evicted = await service.enforceMaxSessions('user-1', 2);

    expect(evicted).toEqual(['token-a']);
    await expect(client.scard('refresh_set:user-1')).resolves.toBe(2);
    await expect(client.smembers('refresh_set:user-1')).resolves.toEqual(
      expect.arrayContaining(['token-b', 'token-c']),
    );
    await expect(client.get('refresh:user-1:token-a')).resolves.toBeNull();
  });
});
