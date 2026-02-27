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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import {
  CreateCorrectiveActionDto,
  UpdateCorrectiveActionStatusDto,
} from './dto/create-corrective-action.dto';
import { UpdateCorrectiveActionDto } from './dto/update-corrective-action.dto';
import { CorrectiveActionsService } from './corrective-actions.service';
import { Role } from '../auth/enums/roles.enum';

@Controller('corrective-actions')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class CorrectiveActionsController {
  constructor(
    private readonly correctiveActionsService: CorrectiveActionsService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  create(@Body() dto: CreateCorrectiveActionDto) {
    return this.correctiveActionsService.create(dto);
  }

  @Post('from/nonconformity/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  createFromNonConformity(@Param('id') id: string) {
    return this.correctiveActionsService.createFromNonConformity(id);
  }

  @Post('from/audit/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  createFromAudit(@Param('id') id: string) {
    return this.correctiveActionsService.createFromAudit(id);
  }

  @Get()
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
  findSummary() {
    return this.correctiveActionsService.findSummary();
  }

  @Get('sla/overview')
  getSlaOverview() {
    return this.correctiveActionsService.getSlaOverview();
  }

  @Get('sla/by-site')
  getSlaBySite() {
    return this.correctiveActionsService.getSlaBySite();
  }

  @Post('sla/escalate')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  runSlaEscalation() {
    return this.correctiveActionsService.runSlaEscalationSweep();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.correctiveActionsService.findOne(id, {
      relations: ['responsible_user', 'site'],
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  update(@Param('id') id: string, @Body() dto: UpdateCorrectiveActionDto) {
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
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCorrectiveActionStatusDto,
  ) {
    return this.correctiveActionsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  remove(@Param('id') id: string) {
    return this.correctiveActionsService.remove(id);
  }
}
