import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ChecklistsService } from './checklists.service';
import { ChecklistsController } from './checklists.controller';
import { PublicChecklistsController } from './public-checklists.controller';
import { Checklist } from './entities/checklist.entity';
import { MailModule } from '../mail/mail.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';
import { UsersModule } from '../users/users.module';
import { SitesModule } from '../sites/sites.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { FileParserModule } from '../document-import/file-parser.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Checklist]),
    forwardRef(() => MailModule),
    SignaturesModule,
    NotificationsModule,
    CommonModule,
    UsersModule,
    SitesModule,
    DocumentRegistryModule,
    FileParserModule,
    DocumentVideosModule,
  ],
  controllers: [ChecklistsController, PublicChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
