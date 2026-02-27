import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { NonConformitiesService } from './nonconformities.service';
import {
  CreateNonConformityDto,
  UpdateNonConformityDto,
} from './dto/create-nonconformity.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { FileInterceptor } from '@nestjs/platform-express';
import { fileUploadOptions } from '../common/interceptors/file-upload.interceptor';
import * as fs from 'fs/promises';

@Controller('nonconformities')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
export class NonConformitiesController {
  constructor(
    private readonly nonConformitiesService: NonConformitiesService,
  ) {}

  @Post()
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.nonConformitiesService.findOne(id);
  }

  @Get(':id/pdf')
  getPdf(@Param('id') id: string) {
    return this.nonConformitiesService.getPdfAccess(id);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  async attachFile(
    @Param('id') id: string,
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

    return this.nonConformitiesService.attachPdf(
      id,
      buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNonConformityDto: UpdateNonConformityDto,
  ) {
    return this.nonConformitiesService.update(id, updateNonConformityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.nonConformitiesService.remove(id);
  }
}
