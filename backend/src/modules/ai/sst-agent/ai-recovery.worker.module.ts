import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai.module';
import { AiRecoveryProcessor } from './ai-recovery.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'ai-recovery' }), AiModule],
  providers: [AiRecoveryProcessor],
})
export class AiRecoveryWorkerModule {}
