import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueMonitorService } from './queue-monitor.service';
import { TempCleanupService } from '../common/services/temp-cleanup.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'pdf-generation' },
      { name: 'mail' },
      { name: 'pdf-generation-dlq' },
      { name: 'mail-dlq' },
      { name: 'document-import' },
      { name: 'document-import-dlq' },
      { name: 'sla-escalation' },
      { name: 'expiry-notifications' },
    ),
  ],
  providers: [QueueMonitorService, TempCleanupService],
  exports: [QueueMonitorService, TempCleanupService],
})
export class QueueServicesModule {}
