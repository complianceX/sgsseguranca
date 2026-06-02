import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentImportModule } from './document-import.module';
import { DocumentImportProcessor } from './document-import.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'document-import' },
      { name: 'document-import-dlq' },
    ),
    DocumentImportModule,
  ],
  providers: [DocumentImportProcessor],
})
export class DocumentImportWorkerModule {}
