import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from './redis/redis.module';
import { TenantService } from './tenant/tenant.service';
import { TenantDbContextService } from './database/tenant-db-context.service';
import { DbTimingsService } from './database/db-timings.service';
import { PasswordService } from './services/password.service';
import { CacheService } from './cache/cache.service';
import { StorageService } from './services/storage.service';
import { PdfService } from './services/pdf.service';
import { PuppeteerPoolService } from './services/puppeteer-pool.service';
import { PdfValidatorService } from './services/pdf-validator.service';
import { SignatureTimestampService } from './services/signature-timestamp.service';
import { TenantRepositoryFactory } from './tenant/tenant-repository';
import { TenantGuard } from './guards/tenant.guard';
import { RiskCalculationService } from './services/risk-calculation.service';
import { DocumentBundleService } from './services/document-bundle.service';
import { DocumentStorageService } from './services/document-storage.service';
import { DocumentRetentionService } from './storage/document-retention.service';
import { PdfIntegrityRecord } from './entities/pdf-integrity-record.entity';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';
import { StorageModule as CommonStorageModule } from './storage/storage.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { ForensicAuditInterceptor } from './interceptors/forensic-audit.interceptor';

@Global()
@Module({
  imports: [
    RedisModule,
    CommonStorageModule,
    ForensicTrailModule,
    TypeOrmModule.forFeature([PdfIntegrityRecord, DocumentRegistryEntry]),
  ],
  providers: [
    TenantService,
    TenantRepositoryFactory,
    TenantGuard,
    TenantDbContextService,
    DbTimingsService,
    PasswordService,
    CacheService,
    StorageService,
    PdfService,
    PuppeteerPoolService,
    PdfValidatorService,
    SignatureTimestampService,
    RiskCalculationService,
    DocumentStorageService,
    DocumentRetentionService,
    DocumentBundleService,
    ForensicAuditInterceptor,
  ],
  exports: [
    RedisModule,
    TypeOrmModule,
    TenantService,
    TenantRepositoryFactory,
    TenantGuard,
    TenantDbContextService,
    DbTimingsService,
    PasswordService,
    CacheService,
    StorageService,
    PdfService,
    PuppeteerPoolService,
    PdfValidatorService,
    SignatureTimestampService,
    RiskCalculationService,
    DocumentStorageService,
    DocumentRetentionService,
    DocumentBundleService,
    ForensicTrailModule,
    ForensicAuditInterceptor,
  ],
})
export class CommonModule {}
