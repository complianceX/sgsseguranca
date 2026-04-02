import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DdsController } from './dds.controller';
import { Dds } from './entities/dds.entity';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { Company } from '../companies/entities/company.entity';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';
import { SignaturesModule } from '../signatures/signatures.module';
import { MetricsRegistryService } from '../common/observability/metrics-registry.service';
import { DDS_DOMAIN_METRICS, DdsService } from './dds.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dds, Company]),
    CommonModule,
    forwardRef(() => AuthModule),
    DocumentRegistryModule,
    DocumentVideosModule,
    SignaturesModule,
  ],
  controllers: [DdsController],
  providers: [
    DdsService,
    {
      provide: DDS_DOMAIN_METRICS,
      inject: [MetricsRegistryService],
      useFactory: (registry: MetricsRegistryService) =>
        registry.register('dds', [
          {
            name: 'dds_created',
            description: 'Total de DDS criados por empresa',
            type: 'counter',
          },
        ]),
    },
  ],
  exports: [DdsService],
})
export class DdsModule {}
