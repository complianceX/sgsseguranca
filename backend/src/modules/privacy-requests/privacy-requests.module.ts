import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../shared/common.module';
import { MailModule } from '../../infra/mail/mail.module';
import { User } from '../users/entities/user.entity';
import { PrivacyRequest } from './entities/privacy-request.entity';
import { PrivacyRequestEvent } from './entities/privacy-request-event.entity';
import { PrivacyRequestsController } from './privacy-requests.controller';
import { PrivacyRequestsService } from './privacy-requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PrivacyRequest, PrivacyRequestEvent, User]),
    CommonModule,
    MailModule,
  ],
  controllers: [PrivacyRequestsController],
  providers: [PrivacyRequestsService],
  exports: [PrivacyRequestsService],
})
export class PrivacyRequestsModule {}
