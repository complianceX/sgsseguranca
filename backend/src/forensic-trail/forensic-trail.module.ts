import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForensicTrailEvent } from './entities/forensic-trail-event.entity';
import { ForensicTrailService } from './forensic-trail.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForensicTrailEvent])],
  providers: [ForensicTrailService],
  exports: [ForensicTrailService],
})
export class ForensicTrailModule {}
