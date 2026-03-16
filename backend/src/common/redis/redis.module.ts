import { Global, Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  providers: [redisProvider, RedisService, DistributedLockService],
  exports: [redisProvider, RedisService, DistributedLockService],
})
export class RedisModule {}
