import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistsService } from './checklists.service';
import { ChecklistsController } from './checklists.controller';
import { Checklist } from './entities/checklist.entity';
import { MailModule } from '../mail/mail.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { SitesModule } from '../sites/sites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Checklist]),
    forwardRef(() => MailModule),
    SignaturesModule,
    NotificationsModule,
    StorageModule,
    UsersModule,
    SitesModule,
  ],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
