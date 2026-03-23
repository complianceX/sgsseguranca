import { Global, Module } from '@nestjs/common';
import { SecurityAuditService } from './security-audit.service';

@Global()
@Module({
  providers: [SecurityAuditService],
  exports: [SecurityAuditService],
})
export class SecurityAuditModule {}
