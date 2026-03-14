import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DdsService } from './dds.service';
import { DdsController } from './dds.controller';
import { Dds } from './entities/dds.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dds, Company]),
    CommonModule,
    AuthModule,
    DocumentRegistryModule,
  ],
  controllers: [DdsController],
  providers: [DdsService],
  exports: [DdsService],
})
export class DdsModule {}
