import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EpisService } from './epis.service';
import { EpisController } from './epis.controller';
import { Epi } from './entities/epi.entity';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Epi]), CommonModule],
  controllers: [EpisController],
  providers: [EpisService],
  exports: [EpisService],
})
export class EpisModule {}
