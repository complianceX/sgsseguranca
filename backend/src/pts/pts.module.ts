import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PtsService } from './pts.service';
import { PtsController } from './pts.controller';
import { Pt } from './entities/pt.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { TrainingsModule } from '../trainings/trainings.module';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { UsersModule } from '../users/users.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pt, Company, User, AuditLog]),
    CommonModule,
    AuthModule,
    TrainingsModule,
    AuditModule,
    UsersModule,
    DocumentRegistryModule,
    SignaturesModule,
    ForensicTrailModule,
  ],
  controllers: [PtsController],
  providers: [PtsService],
  exports: [PtsService],
})
export class PtsModule {}
