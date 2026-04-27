import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsService } from './inspections.service';
import { InspectionsController } from './inspections.controller';
import { PublicInspectionsController } from './public-inspections.controller';
import { Inspection } from './entities/inspection.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';
import { FileInspectionModule } from '../common/security/file-inspection.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inspection, Site, User]),
    NotificationsModule,
    DocumentRegistryModule,
    DocumentVideosModule,
    FileInspectionModule,
  ],
  controllers: [InspectionsController, PublicInspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
