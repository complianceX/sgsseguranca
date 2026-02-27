import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cat } from '../cats/entities/cat.entity';
import { CommonModule } from '../common/common.module';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Training, EpiAssignment, Pt, Cat, Site]),
    CommonModule,
  ],
  controllers: [DossiersController],
  providers: [DossiersService],
  exports: [DossiersService],
})
export class DossiersModule {}
