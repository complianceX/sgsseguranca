import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ClamAvFileInspectionProvider,
  FILE_INSPECTION_PROVIDERS,
  FileInspectionProvider,
  FileInspectionService,
} from './file-inspection.service';

/**
 * Módulo de inspeção de arquivos (AV/CDR).
 *
 * Deve ser importado explicitamente em cada módulo que usa FileInspectionService:
 * StorageModule, AprsModule, DocumentImportModule.
 *
 * Provider ANTIVIRUS_PROVIDER=clamav → usa ClamAvFileInspectionProvider
 * apontando para CLAMAV_HOST:CLAMAV_PORT (padrão: 127.0.0.1:3310).
 * Em produção sem ANTIVIRUS_PROVIDER configurado, FileInspectionService
 * lança ServiceUnavailableException bloqueando o upload.
 */
@Module({
  imports: [ConfigModule],
  providers: [
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
  exports: [FileInspectionService],
})
export class FileInspectionModule {}
