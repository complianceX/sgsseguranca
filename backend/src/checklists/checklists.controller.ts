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
  StreamableFile,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChecklistsService } from './checklists.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import {
  cleanupUploadedTempFile,
  createTemporaryUploadOptions,
  readUploadedFileBuffer,
} from '../common/interceptors/file-upload.interceptor';

const wordUploadOptions = createTemporaryUploadOptions({
  maxFileSize: 20 * 1024 * 1024,
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf',
    ];
    const lowerName = file.originalname.toLowerCase();
    if (
      allowed.includes(file.mimetype) ||
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      lowerName.endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Apenas arquivos Word (.docx, .doc) ou PDF são aceitos.',
        ),
        false,
      );
    }
  },
});

@Controller('checklists')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post('seed/welding-machine')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  seedWeldingMachine() {
    return this.checklistsService.createWeldingMachineTemplate();
  }

  @Post('templates/bootstrap')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  bootstrapTemplates() {
    return this.checklistsService.createPresetTemplates();
  }

  @Post('import-word')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  @UseInterceptors(FileInterceptor('file', wordUploadOptions))
  async importWord(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    const buffer = await readUploadedFileBuffer(file);
    try {
      return await this.checklistsService.importFromWord(
        buffer,
        file.mimetype,
        file.originalname,
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  create(@Body() createChecklistDto: CreateChecklistDto) {
    return this.checklistsService.create(createChecklistDto);
  }

  @Get()
  @Authorize('can_view_checklists')
  findPaginated(
    @Query('onlyTemplates') onlyTemplates?: string,
    @Query('excludeTemplates') excludeTemplates?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.checklistsService.findPaginated({
      onlyTemplates: onlyTemplates === 'true',
      excludeTemplates: excludeTemplates === 'true',
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('files/list')
  @Authorize('can_view_checklists')
  listStoredFiles(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.checklistsService.listStoredFiles({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get('files/weekly-bundle')
  @Authorize('can_view_checklists')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.checklistsService.getWeeklyBundle({
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
  @Authorize('can_view_checklists')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.checklistsService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_checklists')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.checklistsService.getPdfAccess(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateChecklistDto: UpdateChecklistDto,
  ) {
    return this.checklistsService.update(id, updateChecklistDto);
  }

  @Post(':id/send-email')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  sendEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { to: string },
  ) {
    return this.checklistsService.sendEmail(id, body.to);
  }

  @Post('fill-from-template/:templateId')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.TRABALHADOR,
  )
  @Authorize('can_view_checklists')
  fillFromTemplate(
    @Param('templateId') templateId: string,
    @Body() fillData: UpdateChecklistDto,
  ) {
    return this.checklistsService.fillFromTemplate(templateId, fillData);
  }

  @Post(':id/save-pdf')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_checklists')
  savePdf(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.checklistsService.savePdfToStorage(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_checklists')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.checklistsService.remove(id);
  }
}
