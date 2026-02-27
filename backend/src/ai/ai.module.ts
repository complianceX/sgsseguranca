import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EpisModule } from '../epis/epis.module';
import { AprsModule } from '../aprs/aprs.module';
import { PtsModule } from '../pts/pts.module';
import { RisksModule } from '../risks/risks.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    EpisModule,
    AprsModule,
    PtsModule,
    RisksModule,
    TrainingsModule,
    ChecklistsModule,
    UsersModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
