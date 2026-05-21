import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantLifecycleController } from './tenant-lifecycle.controller';
import { TenantLifecycleService } from './tenant-lifecycle.service';
import { TenantOnboardingInvite } from './entities/tenant-onboarding-invite.entity';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { UserSite } from '../users/entities/user-site.entity';
import { Site } from '../sites/entities/site.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantOnboardingInvite,
      Company,
      User,
      UserSite,
      Site,
      Profile,
    ]),
    forwardRef(() => MailModule),
  ],
  controllers: [TenantLifecycleController],
  providers: [TenantLifecycleService],
  exports: [TenantLifecycleService],
})
export class TenantLifecycleModule {}
