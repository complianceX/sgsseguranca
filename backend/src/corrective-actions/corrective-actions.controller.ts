import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  CreateCorrectiveActionDto,
  UpdateCorrectiveActionStatusDto,
} from './dto/create-corrective-action.dto';
import { UpdateCorrectiveActionDto } from './dto/update-corrective-action.dto';
import { CorrectiveActionsService } from './corrective-actions.service';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

@Controller('corrective-actions')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CorrectiveActionsController {
  constructor(
    private readonly correctiveActionsService: CorrectiveActionsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_corrective_actions')
  create(@Body() dto: CreateCorrectiveActionDto) {
    return this.correctiveActionsService.create(dto);
  }

  @Post('from/nonconformity/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_corrective_actions')
  createFromNonConformity(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.correctiveActionsService.createFromNonConformity(id);
  }

  @Post('from/audit/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_corrective_actions')
  createFromAudit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.correctiveActionsService.createFromAudit(id);
  }

  @Get()
  @Authorize('can_view_corrective_actions')
  findAll(
    @Query('status')
    status?: 'open' | 'in_progress' | 'done' | 'overdue' | 'cancelled',
    @Query('source_type') sourceType?: 'manual' | 'nonconformity' | 'audit',
    @Query('due') due?: 'overdue' | 'soon',
  ) {
    return this.correctiveActionsService.list({
      status,
      source_type: sourceType,
      due,
    });
  }

  @Get('summary')
  @Authorize('can_view_corrective_actions')
  findSummary() {
    return this.correctiveActionsService.findSummary();
  }

  @Get('sla/overview')
  @Authorize('can_view_corrective_actions')
  getSlaOverview() {
    return this.correctiveActionsService.getSlaOverview();
  }

  @Get('sla/by-site')
  @Authorize('can_view_corrective_actions')
  getSlaBySite() {
    return this.correctiveActionsService.getSlaBySite();
  }

  @Post('sla/escalate')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_corrective_actions')
  runSlaEscalation() {
    return this.correctiveActionsService.runSlaEscalationSweep();
  }

  @Get(':id')
  @Authorize('can_view_corrective_actions')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.correctiveActionsService.findOne(id, {
      relations: ['responsible_user', 'site'],
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_corrective_actions')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCorrectiveActionDto,
  ) {
    return this.correctiveActionsService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_corrective_actions')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCorrectiveActionStatusDto,
  ) {
    return this.correctiveActionsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_corrective_actions')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.correctiveActionsService.remove(id);
  }
}
