import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
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
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { DdsStatus } from './entities/dds.entity';

@Controller('dds')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DdsController {
  constructor(
    private readonly ddsService: DdsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

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
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async createWithFile(
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const dto: CreateDdsDto = {
      tema: body.tema,
      conteudo: body.conteudo,
      data: body.data,
      site_id: body.site_id,
      facilitador_id: body.facilitador_id,
      company_id: body.company_id,
      is_modelo: body.is_modelo === 'true',
      participants: body.participants
        ? (JSON.parse(body.participants) as string[])
        : undefined,
    };

    const dds = await this.ddsService.create(dto);

    if (file) {
      await this.ddsService.attachPdf(dds.id, file);
      return this.ddsService.findOne(dds.id);
    }

    return dds;
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
  getHistoricalPhotoHashes(@Query('limit') limit?: string) {
    return this.ddsService.getHistoricalPhotoHashes(limit ? Number(limit) : 100);
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
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    try {
      if (req.user?.id) {
        await this.pdfRateLimitService.checkDownloadLimit(req.user.id, req.ip);
      }
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
    return this.ddsService.findOne(id);
  }

  /** Retorna URL assinada (S3) ou null do PDF armazenado */
  @Get(':id/pdf')
  @Authorize('can_view_dds')
  async getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.getPdfAccess(id);
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
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.ddsService.attachPdf(id, file);
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
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() updateDdsDto: UpdateDdsDto) {
    return this.ddsService.update(id, updateDdsDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_dds')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ddsService.remove(id);
  }
}
