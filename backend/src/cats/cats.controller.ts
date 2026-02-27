import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs/promises';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../auth/enums/roles.enum';
import { validateFileMagicBytes } from '../common/interceptors/file-upload.interceptor';
import { fileUploadOptions } from '../common/interceptors/file-upload.interceptor';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CatsService } from './cats.service';
import { CloseCatDto } from './dto/close-cat.dto';
import { CreateCatDto } from './dto/create-cat.dto';
import { StartCatInvestigationDto } from './dto/start-cat-investigation.dto';
import { UpdateCatDto } from './dto/update-cat.dto';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

@Controller('cats')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  create(@Body() createDto: CreateCatDto, @Req() req: AuthenticatedRequest) {
    return this.catsService.create(createDto, req.user?.id);
  }

  @Get()
  findAll(
    @Query('status') status?: 'aberta' | 'investigacao' | 'fechada',
    @Query('worker_id') workerId?: string,
    @Query('site_id') siteId?: string,
  ) {
    return this.catsService.findAll({
      status,
      worker_id: workerId,
      site_id: siteId,
    });
  }

  @Get('summary')
  getSummary() {
    return this.catsService.getSummary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.update(id, updateDto, req.user?.id);
  }

  @Post(':id/investigation')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  startInvestigation(
    @Param('id') id: string,
    @Body() dto: StartCatInvestigationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.startInvestigation(id, dto, req.user?.id);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  close(
    @Param('id') id: string,
    @Body() dto: CloseCatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.close(id, dto, req.user?.id);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  async attachFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
    @Query('category')
    category?: 'abertura' | 'investigacao' | 'fechamento' | 'geral',
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo de anexo não enviado.');
    }

    const validCategories: Array<
      'abertura' | 'investigacao' | 'fechamento' | 'geral'
    > = ['abertura', 'investigacao', 'fechamento', 'geral'];
    if (category && !validCategories.includes(category)) {
      throw new BadRequestException(
        `Categoria inválida. Use: ${validCategories.join(', ')}`,
      );
    }

    const buffer =
      file.buffer && file.buffer.length > 0 ? file.buffer : undefined;

    if (!buffer) {
      throw new BadRequestException('Falha ao ler o arquivo enviado.');
    }

    await validateFileMagicBytes(buffer);

    return this.catsService.addAttachment(
      id,
      {
        fileBuffer: buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        category,
      },
      req.user?.id,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.removeAttachment(id, attachmentId, req.user?.id);
  }

  @Get(':id/attachments/:attachmentId/access')
  getAttachmentAccess(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.catsService.getAttachmentAccess(id, attachmentId);
  }
}
