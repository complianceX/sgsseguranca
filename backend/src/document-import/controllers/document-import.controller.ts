import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { DocumentImportResponseDto } from '../dto/document-analysis.dto';
import { DocumentImportService } from '../services/document-import.service';
import {
  cleanupUploadedTempFile,
  fileUploadOptions,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../../common/interceptors/file-upload.interceptor';
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
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
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
    @Req() req: { user?: { company_id?: string } },
  ): Promise<DocumentImportResponseDto> {
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

      // Processa o documento através do serviço
      const result = await this.documentImportService.processDocument(
        buffer,
        effectiveEmpresaId,
        uploadDto.tipoDocumento,
        file.mimetype,
        file.originalname,
      );

      this.logger.log(
        `Documento ${uploadDto.tipoDocumento} processado com sucesso para empresa ${effectiveEmpresaId}`,
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
      await cleanupUploadedTempFile(file, this.logger);
    }
  }
}
