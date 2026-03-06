import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rdo } from './entities/rdo.entity';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rdo])],
  controllers: [RdosController],
  providers: [RdosService],
  exports: [RdosService],
})
export class RdosModule {}
