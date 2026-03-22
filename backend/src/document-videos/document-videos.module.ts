import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { ForensicTrailModule } from '../forensic-trail/forensic-trail.module';
import { DocumentVideoAttachment } from './entities/document-video-attachment.entity';
import { DocumentVideosService } from './document-videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentVideoAttachment]),
    CommonModule,
    ForensicTrailModule,
  ],
  providers: [DocumentVideosService],
  exports: [DocumentVideosService],
})
export class DocumentVideosModule {}
