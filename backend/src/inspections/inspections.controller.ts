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
} from '@nestjs/common';
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
  findAll() {
    return this.inspectionsService.findAll(this.getTenantIdOrThrow());
  }

  @Get(':id')
  @Authorize('can_view_inspections')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inspectionsService.findOne(id, this.getTenantIdOrThrow());
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
}
