import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { QueueMonitorService } from './queue-monitor.service';
import { TempCleanupService } from '../common/services/temp-cleanup.service';
import { DlqRetentionService } from './dlq-retention.service';

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
      { name: 'document-retention' },
    ),
  ],
  providers: [QueueMonitorService, TempCleanupService, DlqRetentionService],
  exports: [
    QueueMonitorService,
    TempCleanupService,
    DlqRetentionService,
    // Re-export queue tokens so worker-only schedulers can inject without re-registering.
    getQueueToken('sla-escalation'),
    getQueueToken('expiry-notifications'),
    getQueueToken('document-retention'),
  ],
})
export class QueueServicesModule {}
