import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentImport } from './entities/document-import.entity';
import { DdsModule } from '../dds/dds.module';
import { DocumentImportController } from './controllers/document-import.controller';
import { DocumentImportService } from './services/document-import.service';
import { FileParserService } from './services/file-parser.service';
import { DocumentClassifierService } from './services/document-classifier.service';
import { DocumentInterpreterService } from './services/document-interpreter.service';
import { DocumentValidationService } from './services/document-validation.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentImport]), DdsModule],
  controllers: [DocumentImportController],
  providers: [
    DocumentImportService,
    FileParserService,
    DocumentClassifierService,
    DocumentInterpreterService,
    DocumentValidationService,
  ],
  exports: [DocumentImportService, TypeOrmModule, FileParserService],
})
export class DocumentImportModule {}
