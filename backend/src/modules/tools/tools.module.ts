import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ToolsService } from './tools.service';
import { ToolsController } from './tools.controller';
import { Tool } from './entities/tool.entity';
import { CommonModule } from '../../shared/common.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tool]), CommonModule],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
