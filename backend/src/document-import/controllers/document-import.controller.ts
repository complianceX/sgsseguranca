import {
  Controller,
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Get,
  HttpException,
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
import { UserThrottle } from '../../common/decorators/user-throttle.decorator';
import { TenantThrottle } from '../../common/decorators/tenant-throttle.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import {
  DocumentImportEnqueueResponseDto,
  DocumentImportStatusResponseDto,
} from '../dto/document-import-queue.dto';
import {
  CreateDdsDraftFromImportDto,
  CreateDdsDraftFromImportResponseDto,
  DdsDraftFromImportResponseDto,
} from '../dto/dds-draft-from-import.dto';
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
import type { RequestWithUser } from '../../auth/interfaces/request-with-user.interface';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiCreatedResponse,
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
  @UserThrottle({ requestsPerMinute: 10 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 200 })
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
    const effectiveEmpresaId = tenantId;

    if (!effectiveEmpresaId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado. Se você for Administrador Geral, informe x-company-id.',
      );
    }

    if (uploadDto.empresaId) {
      throw new ForbiddenException(
        'empresaId no payload não é permitido. Use o header x-company-id.',
      );
    }

    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    try {
      this.logger.log(
        `Iniciando processamento de documento: ${uploadDto.tipoDocumento} para empresa ${effectiveEmpresaId}`,
      );
      const buffer = await readUploadedFileBuffer(file);

      // Segurança de upload: valida MIME real por magic bytes quando aplicável.
      // Observação: file-type não detecta com precisão arquivos text/plain; para textos, aceitamos apenas se o mimetype indicar text/* ou .txt.
      const lowerName = (file.originalname || '').toLowerCase();
      const isTextUpload =
        String(file.mimetype || '').startsWith('text/') ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.csv');
      if (!isTextUpload) {
        validateFileMagicBytes(buffer, [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'image/jpeg',
          'image/png',
          'image/webp',
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
        error instanceof HttpException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
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
  @UserThrottle({ requestsPerMinute: 30 })
  @TenantThrottle({ requestsPerMinute: 120 })
  @ApiOperation({ summary: 'Consultar status da importação documental' })
  @ApiOkResponse({
    description: 'Status atual da importação',
    type: DocumentImportStatusResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Importação não encontrada' })
  async getImportStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: RequestWithUser,
  ): Promise<DocumentImportStatusResponseDto> {
    const tenantId =
      req.user.company_id ||
      req.user.companyId ||
      this.tenantService.getTenantId();

    if (!tenantId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado. Se você for Administrador Geral, informe x-company-id.',
      );
    }

    const result = await this.documentImportService.getDocumentStatusResponse(
      id,
      tenantId,
    );

    if (!result) {
      throw new NotFoundException('Documento não encontrado.');
    }

    return result;
  }

  @Get(':id/dds-draft')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_import_documents')
  @UserThrottle({ requestsPerMinute: 30 })
  @TenantThrottle({ requestsPerMinute: 120 })
  @ApiOperation({
    summary: 'Gerar prévia de DDS a partir de importação concluída',
  })
  @ApiOkResponse({
    description: 'Prévia de DDS gerada para validação humana',
    type: DdsDraftFromImportResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Importação não encontrada' })
  async getDdsDraftPreview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: RequestWithUser,
  ): Promise<DdsDraftFromImportResponseDto> {
    const tenantId = this.resolveTenantId(req);
    const result = await this.documentImportService.getDdsDraftPreview(
      id,
      tenantId,
    );

    if (!result) {
      throw new NotFoundException('Documento não encontrado.');
    }

    return result;
  }

  @Post(':id/dds-draft')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  @UserThrottle({ requestsPerMinute: 10 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 120 })
  @ApiOperation({
    summary: 'Criar rascunho de DDS validado a partir de importação',
  })
  @ApiCreatedResponse({
    description: 'Rascunho de DDS criado após validação humana',
    type: CreateDdsDraftFromImportResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Importação não encontrada' })
  async createDdsDraftFromImport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDdsDraftFromImportDto,
    @Req() req: RequestWithUser,
  ): Promise<CreateDdsDraftFromImportResponseDto> {
    const tenantId = this.resolveTenantId(req);
    const result = await this.documentImportService.createDdsDraftFromImport(
      id,
      tenantId,
      dto,
    );

    if (!result) {
      throw new NotFoundException('Documento não encontrado.');
    }

    return result;
  }

  private resolveTenantId(req: RequestWithUser): string {
    const tenantId =
      req.user.company_id ||
      req.user.companyId ||
      this.tenantService.getTenantId();

    if (!tenantId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado. Se você for Administrador Geral, informe x-company-id.',
      );
    }

    return tenantId;
  }
}
