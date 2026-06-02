import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageService } from '../../shared/services/storage.service';
import { AuditModule } from '../../modules/audit-trail/audit.module';
import { FileInspectionModule } from '../../shared/security/file-inspection.module';

@Module({
  imports: [ConfigModule, AuditModule, FileInspectionModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
