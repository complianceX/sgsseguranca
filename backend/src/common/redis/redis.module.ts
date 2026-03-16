import { Global, Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';
import { DistributedLockService } from './distributed-lock.service';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

@Global()
@Module({
  providers: [
    redisProvider,
    RedisService,
    DistributedLockService,
    WorkerHeartbeatService,
  ],
  exports: [
    redisProvider,
    RedisService,
    DistributedLockService,
    WorkerHeartbeatService,
  ],
})
export class RedisModule {}
