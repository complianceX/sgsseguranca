import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ForensicTrailModule } from '../../forensic-trail/forensic-trail.module';
import { RedisModule } from '../redis/redis.module';
import { SecurityAuditService } from './security-audit.service';
import { SensitiveActionGuard } from './sensitive-action.guard';

@Global()
@Module({
  imports: [ForensicTrailModule, RedisModule, JwtModule],
  providers: [SecurityAuditService, SensitiveActionGuard],
  exports: [JwtModule, SecurityAuditService, SensitiveActionGuard],
})
export class SecurityAuditModule {}
