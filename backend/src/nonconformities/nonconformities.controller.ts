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
  UploadedFile,
  BadRequestException,
  Query,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { NonConformitiesService, NcStatus } from './nonconformities.service';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  fileUploadOptions,
  validatePdfMagicBytes,
} from '../common/interceptors/file-upload.interceptor';
import * as fs from 'fs/promises';
import { Authorize } from '../auth/authorize.decorator';

@Controller('nonconformities')
@UseGuards(JwtAuthGuard, TenantGuard)
@UseInterceptors(TenantInterceptor)
export class NonConformitiesController {
  constructor(
    private readonly nonConformitiesService: NonConformitiesService,
  ) {}

  @Post()
  @Authorize('can_manage_nc')
  create(@Body() createNonConformityDto: CreateNonConformityDto) {
    return this.nonConformitiesService.create(createNonConformityDto);
  }

  @Get()
  findAll() {
    return this.nonConformitiesService.findAll();
  }

  @Get('files/list')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.nonConformitiesService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('analytics/monthly')
  getMonthlyAnalytics() {
    return this.nonConformitiesService.getMonthlyAnalytics();
  }

  @Get('export/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="nao-conformidades.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.nonConformitiesService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.findOne(id);
  }

  @Get(':id/pdf')
  getPdf(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.getPdfAccess(id);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo PDF não enviado');
    }
    const buffer =
      file.buffer && file.buffer.length > 0
        ? file.buffer
        : file.path
          ? await fs.readFile(file.path)
          : undefined;

    if (!buffer) {
      throw new BadRequestException('Falha ao ler o arquivo enviado');
    }

    // Segurança: valida PDF por magic bytes (não confiar apenas em mimetype)
    await validatePdfMagicBytes(buffer);

    return this.nonConformitiesService.attachPdf(
      id,
      buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Patch(':id/status')
  @Authorize('can_manage_nc')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: NcStatus,
  ) {
    return this.nonConformitiesService.updateStatus(id, status);
  }

  @Patch(':id')
  @Authorize('can_manage_nc')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateNonConformityDto: UpdateNonConformityDto,
  ) {
    return this.nonConformitiesService.update(id, updateNonConformityDto);
  }

  @Delete(':id')
  @Authorize('can_manage_nc')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.nonConformitiesService.remove(id);
  }
}
