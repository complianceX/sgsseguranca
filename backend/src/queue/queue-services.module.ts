import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueMonitorService } from './queue-monitor.service';
import { TempCleanupService } from '../common/services/temp-cleanup.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'pdf-generation' }, { name: 'mail' }),
  ],
  providers: [QueueMonitorService, TempCleanupService],
  exports: [QueueMonitorService, TempCleanupService],
})
export class QueueServicesModule {}
