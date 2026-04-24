import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { ConsentsService } from './consents.service';
import { ConsentsController } from './consents.controller';
import { ConsentVersion } from './entities/consent-version.entity';
import { UserConsent } from './entities/user-consent.entity';
import { ConsentsSeederService } from './consents.seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsentVersion, UserConsent]),
    CommonModule,
  ],
  controllers: [ConsentsController],
  providers: [ConsentsService, ConsentsSeederService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
