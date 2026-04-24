import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SophieController } from './sophie.controller';
import { SophieEngineService } from './sophie.engine.service';
import { SophieLocalChatService } from './sophie.local-chat.service';
import { AiConsentGuard } from '../common/guards/ai-consent.guard';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';
import { ConsentsModule } from '../consents/consents.module';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User]), ConsentsModule],
  controllers: [SophieController],
  providers: [
    SophieEngineService,
    SophieLocalChatService,
    FeatureAiGuard,
    AiConsentGuard,
  ],
  exports: [SophieEngineService, SophieLocalChatService],
})
export class SophieModule {}
