import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { Machine } from './entities/machine.entity';
import { CommonModule } from '../../shared/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Machine]), CommonModule],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
