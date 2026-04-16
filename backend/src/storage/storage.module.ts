import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageController } from './storage.controller';
import { StorageService } from '../common/services/storage.service';
import { AuditModule } from '../audit/audit.module';

// FileInspectionService é provido globalmente pelo FileInspectionModule
// declarado no AppModule — não é necessário redeclará-lo aqui.
@Module({
  imports: [ConfigModule, AuditModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
