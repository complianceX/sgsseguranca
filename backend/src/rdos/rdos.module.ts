import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rdo } from './entities/rdo.entity';
import { RdoAuditEvent } from './entities/rdo-audit-event.entity';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';
import { RdoAuditService } from './rdo-audit.service';
import { MailModule } from '../mail/mail.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { AuthModule } from '../auth/auth.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { CommonModule } from '../common/common.module';
import { DocumentVideosModule } from '../document-videos/document-videos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rdo, RdoAuditEvent]),
    forwardRef(() => MailModule),
    DocumentRegistryModule,
    AuthModule,
    ForensicTrailModule,
    CommonModule,
    DocumentVideosModule,
  ],
  controllers: [RdosController],
  providers: [RdosService, RdoAuditService],
  exports: [RdosService],
})
export class RdosModule {}
