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
} from '@nestjs/common';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';

@Controller('sites')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_sites')
  create(@Body() createSiteDto: CreateSiteDto) {
    return this.sitesService.create(createSiteDto);
  }

  @Get()
  @Authorize('can_view_sites')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.sitesService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      companyId,
    });
  }

  @Get(':id')
  @Authorize('can_view_sites')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sitesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_sites')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateSiteDto: UpdateSiteDto,
  ) {
    return this.sitesService.update(id, updateSiteDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_sites')
  @ForensicAuditAction('delete', 'site')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sitesService.remove(id);
  }
}
