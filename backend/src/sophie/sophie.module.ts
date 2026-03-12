import { Module } from '@nestjs/common';
import { SophieController } from './sophie.controller';
import { SophieEngineService } from './sophie.engine.service';
import { SophieLocalChatService } from './sophie.local-chat.service';

@Module({
  controllers: [SophieController],
  providers: [SophieEngineService, SophieLocalChatService],
  exports: [SophieEngineService, SophieLocalChatService],
})
export class SophieModule {}

