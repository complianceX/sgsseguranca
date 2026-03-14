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
import { PdfIntegrityRecord } from './entities/pdf-integrity-record.entity';

@Global()
@Module({
  imports: [RedisModule, TypeOrmModule.forFeature([PdfIntegrityRecord])],
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
    DocumentBundleService,
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
    DocumentBundleService,
  ],
})
export class CommonModule {}
