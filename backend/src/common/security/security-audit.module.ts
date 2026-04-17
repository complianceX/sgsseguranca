import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ForensicTrailModule } from '../../forensic-trail/forensic-trail.module';
import { RedisModule } from '../redis/redis.module';
import { SecurityAuditService } from './security-audit.service';
import { SensitiveActionGuard } from './sensitive-action.guard';
import { AuditReadInterceptor } from './audit-read.interceptor';

@Global()
@Module({
  imports: [ForensicTrailModule, RedisModule, JwtModule],
  providers: [SecurityAuditService, SensitiveActionGuard, AuditReadInterceptor],
  exports: [
    JwtModule,
    SecurityAuditService,
    SensitiveActionGuard,
    AuditReadInterceptor,
  ],
})
export class SecurityAuditModule {}
