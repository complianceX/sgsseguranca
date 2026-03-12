import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UnauthorizedException,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InspectionsService } from './inspections.service';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import type { Response } from 'express';

@Controller('inspections')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class InspectionsController {
  constructor(
    private readonly inspectionsService: InspectionsService,
    private readonly tenantService: TenantService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }
    return tenantId;
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  create(@Body() createInspectionDto: CreateInspectionDto) {
    return this.inspectionsService.create(
      createInspectionDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Get()
  @Authorize('can_view_inspections')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.inspectionsService.findPaginated(this.getTenantIdOrThrow(), {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get(':id')
  @Authorize('can_view_inspections')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.findOne(id, this.getTenantIdOrThrow());
  }

  @Get(':id/evidences/:index/file')
  @Authorize('can_view_inspections')
  async downloadEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const tenantId = this.getTenantIdOrThrow();
    const numericIndex = Number(index);
    if (!Number.isFinite(numericIndex) || numericIndex < 0) {
      throw new BadRequestException('Índice de evidência inválido.');
    }

    const { buffer, contentType, filename } =
      await this.inspectionsService.downloadEvidenceFile(
        id,
        numericIndex,
        tenantId,
      );

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateInspectionDto: UpdateInspectionDto,
  ) {
    return this.inspectionsService.update(
      id,
      updateInspectionDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_inspections')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.remove(id, this.getTenantIdOrThrow());
  }

  @Post(':id/evidences')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_inspections')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  async attachEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('descricao') descricao?: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    return this.inspectionsService.attachEvidence(
      id,
      file,
      descricao,
      this.getTenantIdOrThrow(),
    );
  }
}
