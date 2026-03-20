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
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Role } from '../auth/enums/roles.enum';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
  fileUploadOptions,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../common/interceptors/file-upload.interceptor';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CatsService } from './cats.service';
import { CloseCatDto } from './dto/close-cat.dto';
import { CreateCatDto } from './dto/create-cat.dto';
import { StartCatInvestigationDto } from './dto/start-cat-investigation.dto';
import { UpdateCatDto } from './dto/update-cat.dto';
import { Authorize } from '../auth/authorize.decorator';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

@Controller('cats')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  create(@Body() createDto: CreateCatDto, @Req() req: AuthenticatedRequest) {
    return this.catsService.create(createDto, req.user?.id);
  }

  @Get()
  @Authorize('can_view_cats')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'aberta' | 'investigacao' | 'fechada',
    @Query('worker_id') workerId?: string,
    @Query('site_id') siteId?: string,
  ) {
    return this.catsService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
      worker_id: workerId,
      site_id: siteId,
    });
  }

  @Get('summary')
  @Authorize('can_view_cats')
  getSummary() {
    return this.catsService.getSummary();
  }

  @Get('statistics')
  @Authorize('can_view_cats')
  getStatistics() {
    return this.catsService.getStatistics();
  }

  @Get(':id')
  @Authorize('can_view_cats')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catsService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_cats')
  getPdfAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.getPdfAccess(id, req.user?.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateCatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.update(id, updateDto, req.user?.id);
  }

  @Post(':id/investigation')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  startInvestigation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StartCatInvestigationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.startInvestigation(id, dto, req.user?.id);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseCatDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.close(id, dto, req.user?.id);
  }

  @Post(':id/file')
  @UseInterceptors(FileInterceptor('file', fileUploadOptions))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
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

    const buffer = await readUploadedFileBuffer(file);

    try {
      validateFileMagicBytes(buffer);

      return await this.catsService.addAttachment(
        id,
        {
          fileBuffer: buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          category,
        },
        req.user?.id,
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
  }

  @Post(':id/pdf/file')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  async attachPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.catsService.attachPdf(id, pdfFile, req.user?.id);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_cats')
  removeAttachment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.removeAttachment(id, attachmentId, req.user?.id);
  }

  @Get(':id/attachments/:attachmentId/access')
  @Authorize('can_view_cats')
  getAttachmentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catsService.getAttachmentAccess(id, attachmentId, req.user?.id);
  }
}
