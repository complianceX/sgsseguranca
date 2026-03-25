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
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ServiceOrdersService } from './service-orders.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';

@Controller('service-orders')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ServiceOrdersController {
  constructor(private readonly serviceOrdersService: ServiceOrdersService) {}

  @Post()
  @Authorize('can_manage_service_orders')
  create(@Body() createServiceOrderDto: CreateServiceOrderDto) {
    return this.serviceOrdersService.create(createServiceOrderDto);
  }

  @Get()
  @Authorize('can_view_service_orders')
  findPaginated(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('site_id') site_id?: string,
  ) {
    return this.serviceOrdersService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      status: status || undefined,
      site_id: site_id || undefined,
    });
  }

  @Get('export/excel')
  @Authorize('can_view_service_orders')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="ordens-servico.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.serviceOrdersService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @Authorize('can_view_service_orders')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.serviceOrdersService.findOne(id);
  }

  @Patch(':id')
  @Authorize('can_manage_service_orders')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateServiceOrderDto: UpdateServiceOrderDto,
  ) {
    return this.serviceOrdersService.update(id, updateServiceOrderDto);
  }

  @Patch(':id/status')
  @Authorize('can_manage_service_orders')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: string,
  ) {
    return this.serviceOrdersService.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_service_orders')
  @ForensicAuditAction('delete', 'service_order')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.serviceOrdersService.remove(id);
  }
}
