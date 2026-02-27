import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { DocumentImportResponseDto } from '../dto/document-analysis.dto';
import { DocumentImportService } from '../services/document-import.service';
import { fileUploadOptions } from '../../common/interceptors/file-upload.interceptor';
import * as fs from 'fs/promises';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';

@ApiTags('document-import')
@Controller('documents/import')
export class DocumentImportController {
  private readonly logger = new Logger(DocumentImportController.name);

  constructor(private readonly documentImportService: DocumentImportService) {}

  @Post()
  @ApiOperation({ summary: 'Importar e analisar documento' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo e metadados',
    type: UploadDocumentDto,
  })
  @ApiCreatedResponse({
    description: 'Documento processado com sucesso',
    type: DocumentImportResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados inválidos ou arquivo duplicado',
  })
  @ApiInternalServerErrorResponse({ description: 'Erro interno no servidor' })
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async importDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadDocumentDto,
  ): Promise<DocumentImportResponseDto> {
    this.logger.log(
      `Iniciando processamento de documento: ${uploadDto.tipoDocumento} para empresa ${uploadDto.empresaId}`,
    );

    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    try {
      // Se usar diskStorage, file.buffer é undefined, precisa ler do disco
      const buffer = file.buffer || Buffer.from(await fs.readFile(file.path));

      if (!buffer) {
        throw new InternalServerErrorException(
          'Falha ao ler o arquivo enviado',
        );
      }

      // Processa o documento através do serviço
      const result = await this.documentImportService.processDocument(
        buffer,
        uploadDto.empresaId,
        uploadDto.tipoDocumento,
        file.mimetype,
        file.originalname,
      );

      this.logger.log(
        `Documento ${uploadDto.tipoDocumento} processado com sucesso para empresa ${uploadDto.empresaId}`,
      );

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Erro no processamento do documento para empresa ${uploadDto.empresaId}:`,
        error instanceof Error ? error.stack : String(error),
      );

      // Re-lança exceções conhecidas para que o filtro de exceções global as trate.
      if (
        error instanceof BadRequestException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      // Converte erros genéricos em exceções NestJS.
      // A verificação por string é frágil, idealmente o serviço deveria lançar exceções customizadas.
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('duplicado')) {
        throw new BadRequestException(errorMessage);
      }

      throw new InternalServerErrorException(
        'Erro interno ao processar documento',
      );
    } finally {
      // RISCO: Se os arquivos em disco não forem limpos, o servidor pode ficar sem espaço (DoS).
      // CORREÇÃO: Garante que o arquivo temporário seja sempre removido após o processamento.
      if (file && file.path) {
        fs.unlink(file.path).catch((err) =>
          this.logger.warn(
            `Falha ao deletar arquivo temporário: ${file.path}. Erro: ${err}`,
          ),
        );
      }
    }
  }
}
