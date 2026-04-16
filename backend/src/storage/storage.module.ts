import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageService } from '../common/services/storage.service';
import { AuditModule } from '../audit/audit.module';
import { FileInspectionModule } from '../common/security/file-inspection.module';

@Module({
  imports: [ConfigModule, AuditModule, FileInspectionModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
