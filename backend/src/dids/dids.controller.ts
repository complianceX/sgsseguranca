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
import { CreateDidDto } from './dto/create-did.dto';
import { FindDidsQueryDto } from './dto/find-dids-query.dto';
import { UpdateDidDto } from './dto/update-did.dto';
import { DidsService } from './dids.service';
import { DidStatus } from './entities/did.entity';

@Controller('dids')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
)
export class DidsController {
  constructor(private readonly didsService: DidsService) {}

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  create(@Body() createDidDto: CreateDidDto) {
    return this.didsService.create(createDidDto);
  }

  @Get()
  @Authorize('can_view_dids')
  findAll(@Query() query: FindDidsQueryDto) {
    return this.didsService.findPaginated(query);
  }

  @Get(':id')
  @Authorize('can_view_dids')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_dids')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.getPdfAccess(id);
  }

  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.didsService.attachPdf(id, pdfFile);
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
  @Authorize('can_manage_dids')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: DidStatus,
  ) {
    if (!Object.values(DidStatus).includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    return this.didsService.updateStatus(id, status);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDidDto: UpdateDidDto,
  ) {
    return this.didsService.update(id, updateDidDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dids')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.remove(id);
  }
}
