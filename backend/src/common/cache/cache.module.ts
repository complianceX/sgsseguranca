import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from './cache.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { CacheShutdownService } from './cache-shutdown.service';
import { RedisModule } from '../redis/redis.module';
import { Apr } from '../../aprs/entities/apr.entity';
import { Checklist } from '../../checklists/entities/checklist.entity';
import { Audit } from '../../audits/entities/audit.entity';
import { Activity } from '../../activities/entities/activity.entity';

@Global()
@Module({
  imports: [
    RedisModule,
    TypeOrmModule.forFeature([Apr, Checklist, Audit, Activity]),
  ],
  providers: [CacheService, DashboardCacheService, CacheShutdownService],
  exports: [CacheService, DashboardCacheService],
})
export class CacheServiceModule {}
