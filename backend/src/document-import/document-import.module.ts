import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentImport } from './entities/document-import.entity';
import { DdsModule } from '../dds/dds.module';
import { AiModule } from '../ai/ai.module';
import { DocumentImportController } from './controllers/document-import.controller';
import { DocumentImportService } from './services/document-import.service';
import { DocumentClassifierService } from './services/document-classifier.service';
import { DocumentInterpreterService } from './services/document-interpreter.service';
import { DocumentValidationService } from './services/document-validation.service';
import { FileParserModule } from './file-parser.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentImport]),
    DdsModule,
    AiModule,
    FileParserModule,
  ],
  controllers: [DocumentImportController],
  providers: [
    DocumentImportService,
    DocumentClassifierService,
    DocumentInterpreterService,
    DocumentValidationService,
  ],
  exports: [DocumentImportService, TypeOrmModule, FileParserModule],
})
export class DocumentImportModule {}
