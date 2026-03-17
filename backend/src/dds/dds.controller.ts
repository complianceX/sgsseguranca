import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Put,
  Param,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  Req,
  Query,
  UnauthorizedException,
  StreamableFile,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DdsService } from './dds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { ReplaceDdsSignaturesDto } from './dto/replace-dds-signatures.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { DdsStatus } from './entities/dds.entity';
import {
  assertUploadedPdf,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';

@Controller('dds')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DdsController {
  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  private getRequestErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Usuário não autorizado';
  }

  private getRequestIp(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  constructor(
    private readonly ddsService: DdsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  private getAuthenticatedUserIdOrThrow(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string {
    const userId = this.getRequestUserId(req);
    if (!userId) {
      throw new UnauthorizedException('Usuário não autorizado');
    }
    return userId;
  }

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  create(@Body() createDdsDto: CreateDdsDto) {
    return this.ddsService.create(createDdsDto);
  }

  /** Cria DDS + anexa PDF em uma única chamada (multipart/form-data) */
  @Post('with-file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async createWithFile(
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      throw new BadRequestException(
        'Anexe o PDF final somente apos salvar o DDS e registrar as assinaturas dos participantes.',
      );
    }

    let participants: string[] | undefined;
    if (body.participants) {
      try {
        participants = JSON.parse(body.participants) as string[];
      } catch {
        throw new BadRequestException(
          'O campo participants deve ser um JSON valido.',
        );
      }
    }

    const dto: CreateDdsDto = {
      tema: body.tema,
      conteudo: body.conteudo,
      data: body.data,
      site_id: body.site_id,
      facilitador_id: body.facilitador_id,
      company_id: body.company_id,
      is_modelo: body.is_modelo === 'true',
      participants,
    };

    return this.ddsService.create(dto);
  }

  @Get()
  @Authorize('can_view_dds')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('kind') kind?: 'all' | 'model' | 'regular',
  ) {
    return this.ddsService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      kind,
    });
  }

  /** Lista IDs recentes para detecção anti-fraude de fotos (elimina N+1 no frontend) */
  @Get('historical-photo-hashes')
  @Authorize('can_view_dds')
  getHistoricalPhotoHashes(
    @Query('limit') limit?: string,
    @Query('exclude_id') excludeId?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.ddsService.getHistoricalPhotoHashes(
      limit ? Number(limit) : 100,
      excludeId,
      companyId,
    );
  }

  @Get('files/list')
  @Authorize('can_view_dds')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.ddsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_dds')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.ddsService.getWeeklyBundle({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  @Get(':id')
  @Authorize('can_view_dds')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.findOne(id);
  }

  /** Retorna URL assinada (S3) ou null do PDF armazenado */
  @Get(':id/pdf')
  @Authorize('can_view_dds')
  async getPdfAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    try {
      await this.pdfRateLimitService.checkDownloadLimit(
        this.getAuthenticatedUserIdOrThrow(req),
        this.getRequestIp(req),
      );
    } catch (error) {
      throw new UnauthorizedException(this.getRequestErrorMessage(error));
    }
    return this.ddsService.getPdfAccess(id);
  }

  @Put(':id/signatures')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  replaceSignatures(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceDdsSignaturesDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.ddsService.replaceSignatures(
      id,
      dto,
      this.getAuthenticatedUserIdOrThrow(req),
    );
  }

  /** Anexa PDF a um DDS existente */
  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = assertUploadedPdf(file);
    return this.ddsService.attachPdf(id, pdfFile);
  }

  /** Avança o status do DDS no workflow (rascunho → publicado → auditado → arquivado) */
  @Patch(':id/status')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dds')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: DdsStatus,
  ) {
    if (!Object.values(DdsStatus).includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }
    return this.ddsService.updateStatus(id, status);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dds')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDdsDto: UpdateDdsDto,
  ) {
    return this.ddsService.update(id, updateDdsDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_dds')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.remove(id);
  }
}
