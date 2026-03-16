import { Module } from '@nestjs/common';
import { FileParserService } from './services/file-parser.service';

@Module({
  providers: [FileParserService],
  exports: [FileParserService],
})
export class FileParserModule {}
