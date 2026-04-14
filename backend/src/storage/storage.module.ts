import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageService } from '../common/services/storage.service';
import { AuditModule } from '../audit/audit.module';
import {
  ClamAvFileInspectionProvider,
  FILE_INSPECTION_PROVIDERS,
  FileInspectionProvider,
  FileInspectionService,
} from '../common/security/file-inspection.service';

@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [StorageController],
  providers: [
    StorageService,
    {
      provide: FILE_INSPECTION_PROVIDERS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): FileInspectionProvider[] => {
        const providerSlug = configService
          .get<string>('ANTIVIRUS_PROVIDER')
          ?.trim()
          .toLowerCase();

        if (providerSlug !== 'clamav') {
          return [];
        }

        const host = configService.get<string>('CLAMAV_HOST')?.trim();
        const port = Number(configService.get<string>('CLAMAV_PORT') || 3310);
        const timeoutMs = Number(
          configService.get<string>('CLAMAV_TIMEOUT_MS') || 15000,
        );

        if (!host || !Number.isFinite(port) || port <= 0) {
          return [];
        }

        return [
          new ClamAvFileInspectionProvider({
            host,
            port: Math.floor(port),
            timeoutMs:
              Number.isFinite(timeoutMs) && timeoutMs > 0
                ? Math.floor(timeoutMs)
                : 15000,
          }),
        ];
      },
    },
    FileInspectionService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
