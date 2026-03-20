import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cat } from '../cats/entities/cat.entity';
import { CommonModule } from '../common/common.module';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';
import { PublicDossiersController } from './public-dossiers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Training, EpiAssignment, Pt, Cat, Site]),
    CommonModule,
    DocumentRegistryModule,
  ],
  controllers: [DossiersController, PublicDossiersController],
  providers: [DossiersService],
  exports: [DossiersService],
})
export class DossiersModule {}
