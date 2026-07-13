import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentImportModule } from './document-import.module';
import { DocumentImportProcessor } from './document-import.processor';
import { ConsentsModule } from '../consents/consents.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'document-import' },
      { name: 'document-import-dlq' },
    ),
    DocumentImportModule,
    ConsentsModule,
  ],
  providers: [DocumentImportProcessor],
})
export class DocumentImportWorkerModule {}
