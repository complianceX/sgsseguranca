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
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';
import { FileInspectionModule } from '../common/security/file-inspection.module';

@Module({
  imports: [
    ...(isRedisDisabled
      ? []
      : [
          BullModule.registerQueue(
            { name: 'document-import' },
            { name: 'document-import-dlq' },
          ),
        ]),
    TypeOrmModule.forFeature([DocumentImport]),
    DdsModule,
    AiModule,
    FileParserModule,
    FileInspectionModule,
  ],
  controllers: [DocumentImportController],
  providers: [
    DocumentImportService,
    DocumentClassifierService,
    DocumentInterpreterService,
    DocumentValidationService,
    ...(isRedisDisabled
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
