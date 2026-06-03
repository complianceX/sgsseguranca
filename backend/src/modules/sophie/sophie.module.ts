import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SophieController } from './sophie.controller';
import { SophieEngineService } from './sophie.engine.service';
import { SophieLocalChatService } from './sophie.local-chat.service';
import { AiConsentGuard } from '../../shared/guards/ai-consent.guard';
import { FeatureAiGuard } from '../../shared/guards/feature-ai.guard';
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
