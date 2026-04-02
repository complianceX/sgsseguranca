import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PtsController } from './pts.controller';
import { Pt } from './entities/pt.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { UsersModule } from '../users/users.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { MetricsRegistryService } from '../common/observability/metrics-registry.service';
import { PTS_DOMAIN_METRICS, PtsService } from './pts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pt, Company, User, AuditLog]),
    CommonModule,
    forwardRef(() => AuthModule),
    AuditModule,
    UsersModule,
    DocumentRegistryModule,
    SignaturesModule,
    ForensicTrailModule,
  ],
  controllers: [PtsController],
  providers: [
    PtsService,
    {
      provide: PTS_DOMAIN_METRICS,
      inject: [MetricsRegistryService],
      useFactory: (registry: MetricsRegistryService) =>
        registry.register('pts', [
          {
            name: 'pts_created',
            description: 'Total de PTs criadas por empresa',
            type: 'counter',
          },
        ]),
    },
  ],
  exports: [PtsService],
})
export class PtsModule {}
