import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  UnauthorizedException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuditsService } from './audits.service';
import { CreateAuditDto, UpdateAuditDto } from './dto/create-audit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantService } from '../common/tenant/tenant.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

@Controller('audits')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AuditsController {
  constructor(
    private readonly auditsService: AuditsService,
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
  @Authorize('can_manage_audits')
  create(@Body() createAuditDto: CreateAuditDto) {
    return this.auditsService.create(createAuditDto, this.getTenantIdOrThrow());
  }

  @Get()
  @Authorize('can_view_audits')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.auditsService.findPaginated(
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        search: search || undefined,
      },
      this.getTenantIdOrThrow(),
    );
  }

  @Get('files/list')
  @Authorize('can_view_audits')
  listStoredFiles(
    @Query('year') year?: string,
    @Query('week') week?: string,
  ) {
    return this.auditsService.listStoredFiles({
      companyId: this.getTenantIdOrThrow(),
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
    });
  }

  @Get(':id')
  @Authorize('can_view_audits')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditsService.findOne(id, this.getTenantIdOrThrow());
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_audits')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAuditDto: UpdateAuditDto,
  ) {
    return this.auditsService.update(
      id,
      updateAuditDto,
      this.getTenantIdOrThrow(),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_audits')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auditsService.remove(id, this.getTenantIdOrThrow());
  }
}
