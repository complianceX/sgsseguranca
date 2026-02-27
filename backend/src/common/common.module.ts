import { Module, Global } from '@nestjs/common';
import { RedisModule } from './redis/redis.module';
import { TenantService } from './tenant/tenant.service';
import { PasswordService } from './services/password.service';
import { CacheService } from './cache/cache.service';
import { StorageService } from './services/storage.service';
import { PdfService } from './services/pdf.service';
import { PuppeteerPoolService } from './services/puppeteer-pool.service';
import { PdfValidatorService } from './services/pdf-validator.service';
import { SignatureTimestampService } from './services/signature-timestamp.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [
    TenantService,
    PasswordService,
    CacheService,
    StorageService,
    PdfService,
    PuppeteerPoolService,
    PdfValidatorService,
    SignatureTimestampService,
  ],
  exports: [
    RedisModule,
    TenantService,
    PasswordService,
    CacheService,
    StorageService,
    PdfService,
    PuppeteerPoolService,
    PdfValidatorService,
    SignatureTimestampService,
  ],
})
export class CommonModule {}
