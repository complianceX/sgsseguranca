import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { EpisModule } from '../epis/epis.module';
import { AprsModule } from '../aprs/aprs.module';
import { PtsModule } from '../pts/pts.module';
import { RisksModule } from '../risks/risks.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { ChecklistsModule } from '../checklists/checklists.module';
import { UsersModule } from '../users/users.module';
import { MedicalExamsModule } from '../medical-exams/medical-exams.module';
import { CatsModule } from '../cats/cats.module';
import { NonConformitiesModule } from '../nonconformities/nonconformities.module';
import { ServiceOrdersModule } from '../service-orders/service-orders.module';

// SST Agent
import { AiInteraction } from './entities/ai-interaction.entity';
import { SstAgentService } from './sst-agent/sst-agent.service';
import { SstAgentController } from './sst-agent/sst-agent.controller';
import { SstToolsExecutor } from './sst-agent/sst-agent.tools';
import { SstRateLimitService } from './sst-agent/sst-rate-limit.service';
import { SophieModule } from '../sophie/sophie.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiInteraction]),
    SophieModule,
    EpisModule,
    AprsModule,
    PtsModule,
    RisksModule,
    TrainingsModule,
    ChecklistsModule,
    UsersModule,
    MedicalExamsModule,
    CatsModule,
    NonConformitiesModule,
    ServiceOrdersModule,
  ],
  controllers: [AiController, SstAgentController],
  providers: [AiService, SstAgentService, SstToolsExecutor, SstRateLimitService],
  exports: [AiService, SstAgentService],
})
export class AiModule {}
