import {
  Controller,
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  ParseUUIDPipe,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import {
  DocumentImportEnqueueResponseDto,
  DocumentImportStatusResponseDto,
} from '../dto/document-import-queue.dto';
import { DocumentImportService } from '../services/document-import.service';
import {
  cleanupUploadedTempFile,
  fileUploadOptions,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../../common/security/file-inspection.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantInterceptor } from '../../common/tenant/tenant.interceptor';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantService } from '../../common/tenant/tenant.service';
import { Authorize } from '../../auth/authorize.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiInternalServerErrorResponse,
  ApiHeader,
} from '@nestjs/swagger';

@ApiTags('document-import')
@Controller('documents/import')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DocumentImportController {
  private readonly logger = new Logger(DocumentImportController.name);

  constructor(
    private readonly documentImportService: DocumentImportService,
    private readonly tenantService: TenantService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_import_documents')
  @ApiOperation({ summary: 'Importar e analisar documento' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Arquivo e metadados',
    type: UploadDocumentDto,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Chave opcional para garantir idempotência formal da operação de importação.',
  })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Documento recebido e enviado para processamento assíncrono',
    type: DocumentImportEnqueueResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Dados inválidos ou arquivo duplicado',
  })
  @ApiInternalServerErrorResponse({ description: 'Erro interno no servidor' })
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async importDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadDocumentDto,
    @Req()
    req: {
      user?: { company_id?: string; userId?: string; id?: string };
      headers?: Record<string, string | string[] | undefined>;
    },
  ): Promise<DocumentImportEnqueueResponseDto> {
    const idempotencyKeyHeaderValue = req.headers?.['idempotency-key'];
    const idempotencyKeyHeader = Array.isArray(idempotencyKeyHeaderValue)
      ? idempotencyKeyHeaderValue[0]
      : idempotencyKeyHeaderValue;

    const tenantId =
      req.user?.company_id || this.tenantService.getTenantId() || undefined;
    const isSuperAdmin = this.tenantService.isSuperAdmin();

    // Multi-tenant enforcement:
    // - Usuários comuns: empresaId deve vir do token/contexto
    // - Admin geral: pode operar cross-tenant, mas deve escolher um tenant (via header x-company-id → TenantMiddleware ou via empresaId legado)
    const effectiveEmpresaId =
      tenantId || (isSuperAdmin ? uploadDto.empresaId : undefined);

    if (!effectiveEmpresaId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado. Se você for Administrador Geral, informe x-company-id ou empresaId.',
      );
    }

    if (
      !isSuperAdmin &&
      uploadDto.empresaId &&
      uploadDto.empresaId !== effectiveEmpresaId
    ) {
      throw new ForbiddenException(
        'empresaId divergente do tenant autenticado.',
      );
    }

    this.logger.log(
      `Iniciando processamento de documento: ${uploadDto.tipoDocumento} para empresa ${effectiveEmpresaId}`,
    );

    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    try {
      const buffer = await readUploadedFileBuffer(file);

      // Segurança de upload: valida MIME real por magic bytes quando aplicável.
      // Observação: file-type não detecta com precisão arquivos text/plain; para textos, aceitamos apenas se o mimetype indicar text/* ou .txt.
      const lowerName = (file.originalname || '').toLowerCase();
      const isTextUpload =
        String(file.mimetype || '').startsWith('text/') ||
        lowerName.endsWith('.txt');
      if (!isTextUpload) {
        validateFileMagicBytes(buffer, [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'image/jpeg',
          'image/png',
        ]);
      }

      // AV/CDR: escaneia o arquivo após validação de magic bytes.
      // FileInspectionService lança ServiceUnavailableException se o scanner
      // estiver indisponível em produção, bloqueando o upload.
      await this.fileInspectionService.inspect(buffer, file.originalname);

      // Processa o documento através do serviço
      const result = await this.documentImportService.enqueueDocumentProcessing(
        buffer,
        effectiveEmpresaId,
        uploadDto.tipoDocumento,
        file.mimetype,
        file.originalname,
        req.user?.userId || req.user?.id,
        idempotencyKeyHeader || uploadDto.idempotencyKey,
      );

      this.logger.log(
        `Documento ${uploadDto.tipoDocumento} enfileirado com sucesso para empresa ${effectiveEmpresaId}`,
      );

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Erro no processamento do documento para empresa ${effectiveEmpresaId}:`,
        error instanceof Error ? error.stack : String(error),
      );

      // Re-lança exceções conhecidas para que o filtro de exceções global as trate.
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException ||
        error instanceof ServiceUnavailableException
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
      await cleanupUploadedTempFile(file, this.logger);
    }
  }

  @Get(':id/status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_import_documents')
  @ApiOperation({ summary: 'Consultar status da importação documental' })
  @ApiOkResponse({
    description: 'Status atual da importação',
    type: DocumentImportStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Importação não encontrada' })
  async getImportStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DocumentImportStatusResponseDto> {
    const result =
      await this.documentImportService.getDocumentStatusResponse(id);

    if (!result) {
      throw new NotFoundException('Importação documental não encontrada.');
    }

    return result;
  }
}
