import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { EnhancedHealthController } from './enhanced-health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TerminusModule, HttpModule, TypeOrmModule],
  controllers: [HealthController, EnhancedHealthController],
  providers: [HealthService],
})
export class HealthModule {}
