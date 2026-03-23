import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Apr } from '../aprs/entities/apr.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Cat } from '../cats/entities/cat.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { CommonModule } from '../common/common.module';
import { Dds } from '../dds/entities/dds.entity';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Rdo } from '../rdos/entities/rdo.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';
import { PublicDossiersController } from './public-dossiers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Training,
      EpiAssignment,
      Pt,
      Cat,
      Apr,
      Dds,
      Rdo,
      Inspection,
      Checklist,
      Audit,
      NonConformity,
      Site,
    ]),
    CommonModule,
    DocumentRegistryModule,
  ],
  controllers: [DossiersController, PublicDossiersController],
  providers: [DossiersService],
  exports: [DossiersService],
})
export class DossiersModule {}
