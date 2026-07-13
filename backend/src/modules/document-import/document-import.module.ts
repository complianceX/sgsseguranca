import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentImport } from './entities/document-import.entity';
import { DdsModule } from '../dds/dds.module';
import { AiModule } from '../ai/ai.module';
import { DocumentImportController } from './controllers/document-import.controller';
import { DocumentImportService } from './services/document-import.service';
import { DocumentClassifierService } from './services/document-classifier.service';
import { DocumentInterpreterService } from './services/document-interpreter.service';
import { DocumentValidationService } from './services/document-validation.service';
import { FileParserModule } from './file-parser.module';
import { createRedisDisabledQueueProvider } from '../../infra/queue/redis-disabled-queue';
import { shouldUseRedisQueueInfra } from '../../infra/queue/redis-queue-infra.util';
import { FileInspectionModule } from '../../shared/security/file-inspection.module';
import { ConsentsModule } from '../consents/consents.module';
import { FeatureAiGuard } from '../../shared/guards/feature-ai.guard';
import { AiConsentGuard } from '../../shared/guards/ai-consent.guard';

@Module({
  imports: [
    ...(shouldUseRedisQueueInfra()
      ? [
          BullModule.registerQueue(
            { name: 'document-import' },
            { name: 'document-import-dlq' },
          ),
        ]
      : []),
    TypeOrmModule.forFeature([DocumentImport]),
    DdsModule,
    AiModule,
    FileParserModule,
    FileInspectionModule,
    ConsentsModule,
  ],
  controllers: [DocumentImportController],
  providers: [
    DocumentImportService,
    DocumentClassifierService,
    DocumentInterpreterService,
    DocumentValidationService,
    FeatureAiGuard,
    AiConsentGuard,
    ...(!shouldUseRedisQueueInfra()
      ? [
          createRedisDisabledQueueProvider('document-import'),
          createRedisDisabledQueueProvider('document-import-dlq', {
            addMode: 'noop',
          }),
        ]
      : []),
  ],
  exports: [DocumentImportService, TypeOrmModule, FileParserModule],
})
export class DocumentImportModule {}
