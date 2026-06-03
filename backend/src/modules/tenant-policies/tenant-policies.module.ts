import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantDocumentPolicy } from './entities/tenant-document-policy.entity';
import { TenantPoliciesService } from './tenant-policies.service';
import { TenantPoliciesController } from './tenant-policies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenantDocumentPolicy])],
  providers: [TenantPoliciesService],
  controllers: [TenantPoliciesController],
  exports: [TenantPoliciesService],
})
export class TenantPoliciesModule {}
