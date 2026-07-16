import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ChecklistsService } from './checklists.service';
import { ChecklistsController } from './checklists.controller';
import { PublicChecklistsController } from './public-checklists.controller';
import { Checklist } from './entities/checklist.entity';
import { MailModule } from '../../infra/mail/mail.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../../shared/common.module';
import { UsersModule } from '../users/users.module';
import { SitesModule } from '../sites/sites.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { FileParserModule } from '../document-import/file-parser.module';
import { ConsentsModule } from '../consents/consents.module';
import { FeatureAiGuard } from '../../shared/guards/feature-ai.guard';
import { AiConsentGuard } from '../../shared/guards/ai-consent.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Checklist]),
    forwardRef(() => MailModule),
    SignaturesModule,
    NotificationsModule,
    CommonModule,
    forwardRef(() => UsersModule),
    SitesModule,
    DocumentRegistryModule,
    FileParserModule,
    ConsentsModule,
  ],
  controllers: [ChecklistsController, PublicChecklistsController],
  providers: [ChecklistsService, FeatureAiGuard, AiConsentGuard],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
