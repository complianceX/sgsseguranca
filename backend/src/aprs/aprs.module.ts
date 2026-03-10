import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AprsService } from './aprs.service';
import { AprsController } from './aprs.controller';
import { Apr } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import { AprRiskItem } from './entities/apr-risk-item.entity';
import { AprRiskEvidence } from './entities/apr-risk-evidence.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Apr,
      AprLog,
      AprRiskItem,
      AprRiskEvidence,
      Company,
    ]),
    CommonModule,
    AuthModule,
    StorageModule,
  ],
  controllers: [AprsController],
  providers: [AprsService],
  exports: [AprsService],
})
export class AprsModule {}
