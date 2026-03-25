import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from '../common/common.module';
import { DocumentRetentionProcessor } from './document-retention.processor';

/**
 * Módulo exclusivo de worker para retenção documental.
 * NÃO deve ser importado no AppModule HTTP.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: 'document-retention' }),
    CommonModule,
  ],
  providers: [DocumentRetentionProcessor],
})
export class DocumentRetentionWorkerModule {}
