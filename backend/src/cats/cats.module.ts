import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';
import { Cat } from './entities/cat.entity';
import { PublicCatsController } from './public-cats.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cat, User, Site]),
    CommonModule,
    AuditModule,
    DocumentRegistryModule,
    DocumentVideosModule,
  ],
  controllers: [CatsController, PublicCatsController],
  providers: [CatsService],
  exports: [CatsService],
})
export class CatsModule {}
