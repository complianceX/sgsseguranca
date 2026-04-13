import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Authorize } from '../auth/authorize.decorator';
import { Role } from '../auth/enums/roles.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { ArrsService } from './arrs.service';
import { CreateArrDto } from './dto/create-arr.dto';
import { FindArrsQueryDto } from './dto/find-arrs-query.dto';
import { UpdateArrDto } from './dto/update-arr.dto';
import { ArrStatus } from './entities/arr.entity';

@Controller('arrs')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
)
export class ArrsController {
  constructor(private readonly arrsService: ArrsService) {}

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_arrs')
  create(@Body() createArrDto: CreateArrDto) {
    return this.arrsService.create(createArrDto);
  }

  @Get()
  @Authorize('can_view_arrs')
  findAll(@Query() query: FindArrsQueryDto) {
    return this.arrsService.findPaginated(query);
  }

  @Get(':id')
  @Authorize('can_view_arrs')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.arrsService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_arrs')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.arrsService.getPdfAccess(id);
  }

  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_arrs')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.arrsService.attachPdf(id, pdfFile);
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Patch(':id/status')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_arrs')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: ArrStatus,
  ) {
    if (!Object.values(ArrStatus).includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    return this.arrsService.updateStatus(id, status);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_arrs')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateArrDto: UpdateArrDto,
  ) {
    return this.arrsService.update(id, updateArrDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_arrs')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.arrsService.remove(id);
  }
}
