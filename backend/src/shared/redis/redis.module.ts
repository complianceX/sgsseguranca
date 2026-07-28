import { Global, Module } from '@nestjs/common';
import {
  redisProvider,
  redisAuthProvider,
  redisCacheProvider,
  redisQueueProvider,
  redisBullMqProvider,
  redisRateLimitProvider,
} from './redis.provider';
import {
  AuthRedisService,
  RateLimitRedisService,
  RedisService,
} from './redis.service';
import { DistributedLockService } from './distributed-lock.service';
import { WorkerHeartbeatService } from './worker-heartbeat.service';
import { RedisShutdownService } from './redis-shutdown.service';

@Global()
@Module({
  providers: [
    redisProvider,
    redisAuthProvider,
    redisCacheProvider,
    redisQueueProvider,
    redisBullMqProvider,
    redisRateLimitProvider,
    RedisService,
    AuthRedisService,
    RateLimitRedisService,
    DistributedLockService,
    WorkerHeartbeatService,
    RedisShutdownService,
  ],
  exports: [
    redisProvider,
    redisAuthProvider,
    redisCacheProvider,
    redisQueueProvider,
    redisBullMqProvider,
    redisRateLimitProvider,
    RedisService,
    AuthRedisService,
    RateLimitRedisService,
    DistributedLockService,
    WorkerHeartbeatService,
  ],
})
export class RedisModule {}
