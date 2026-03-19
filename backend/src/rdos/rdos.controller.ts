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
  Query,
  Header,
  StreamableFile,
  HttpCode,
  HttpStatus,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RdosService } from './rdos.service';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';
import { SignRdoDto } from './dto/sign-rdo.dto';
import { SavePdfDto } from './dto/save-pdf.dto';
import { SendEmailDto } from './dto/send-email.dto';

@Controller('rdos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class RdosController {
  constructor(private readonly rdosService: RdosService) {}

  @Post()
  @Authorize('can_manage_rdos')
  create(@Body() createRdoDto: CreateRdoDto) {
    return this.rdosService.create(createRdoDto);
  }

  @Get()
  @Authorize('can_view_rdos')
  findPaginated(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('site_id') site_id?: string,
    @Query('status') status?: string,
    @Query('data_inicio') data_inicio?: string,
    @Query('data_fim') data_fim?: string,
  ) {
    return this.rdosService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      site_id: site_id || undefined,
      status: status || undefined,
      data_inicio: data_inicio || undefined,
      data_fim: data_fim || undefined,
    });
  }

  @Get('export/excel')
  @Authorize('can_view_rdos')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="rdos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.rdosService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get('files/list')
  @Authorize('can_view_rdos')
  listFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.rdosService.listFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_rdos')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.rdosService.getWeeklyBundle({
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
  @Authorize('can_view_rdos')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_rdos')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.getPdfAccess(id);
  }

  @Patch(':id')
  @Authorize('can_manage_rdos')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateRdoDto: UpdateRdoDto,
  ) {
    return this.rdosService.update(id, updateRdoDto);
  }

  @Patch(':id/status')
  @Authorize('can_manage_rdos')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: string,
  ) {
    return this.rdosService.updateStatus(id, status);
  }

  @Patch(':id/sign')
  @Authorize('can_manage_rdos')
  sign(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: SignRdoDto) {
    return this.rdosService.sign(id, body);
  }

  @Post(':id/save-pdf')
  @Authorize('can_manage_rdos')
  savePdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SavePdfDto,
  ) {
    return this.rdosService.markPdfSaved(id, body);
  }

  @Post(':id/file')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_rdos')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.handlePdfUpload(id, file);
  }

  private async handlePdfUpload(id: string, file?: Express.Multer.File) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.rdosService.savePdf(id, pdfFile);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Post(':id/send-email')
  @Authorize('can_manage_rdos')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendEmailDto,
  ) {
    await this.rdosService.sendEmail(id, body.to);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_rdos')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.rdosService.remove(id);
  }
}
