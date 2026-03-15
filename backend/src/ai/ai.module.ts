import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
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
import { DdsModule } from '../dds/dds.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { ActivitiesModule } from '../activities/activities.module';
import { ToolsModule } from '../tools/tools.module';
import { MachinesModule } from '../machines/machines.module';

// SST Agent
import { AiInteraction } from './entities/ai-interaction.entity';
import { SstAgentService } from './sst-agent/sst-agent.service';
import { SstAgentController } from './sst-agent/sst-agent.controller';
import { SstToolsExecutor } from './sst-agent/sst-agent.tools';
import { SstRateLimitService } from './sst-agent/sst-rate-limit.service';
import { SophieFacadeService } from './sophie-facade.service';
import { SophieModule } from '../sophie/sophie.module';
import { FeatureAiGuard } from '../common/guards/feature-ai.guard';
import {
  createRedisDisabledQueueProvider,
  isRedisDisabled,
} from '../queue/redis-disabled-queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiInteraction]),
    ...(isRedisDisabled
      ? []
      : [BullModule.registerQueue({ name: 'pdf-generation' })]),
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
    DdsModule,
    InspectionsModule,
    ActivitiesModule,
    ToolsModule,
    MachinesModule,
  ],
  controllers: [AiController, SstAgentController],
  providers: [
    AiService,
    SstAgentService,
    SstToolsExecutor,
    SstRateLimitService,
    SophieFacadeService,
    FeatureAiGuard,
    ...(isRedisDisabled
      ? [createRedisDisabledQueueProvider('pdf-generation')]
      : []),
  ],
  exports: [AiService, SstAgentService, SophieFacadeService],
})
export class AiModule {}
