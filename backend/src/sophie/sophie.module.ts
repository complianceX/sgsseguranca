import { Module } from '@nestjs/common';
import { SophieController } from './sophie.controller';
import { SophieEngineService } from './sophie.engine.service';
import { SophieLocalChatService } from './sophie.local-chat.service';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';

@Module({
  controllers: [SophieController],
  providers: [SophieEngineService, SophieLocalChatService, FeatureAiGuard],
  exports: [SophieEngineService, SophieLocalChatService],
})
export class SophieModule {}
