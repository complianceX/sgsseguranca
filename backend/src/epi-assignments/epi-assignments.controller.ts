import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';
import { CreateEpiAssignmentDto } from './dto/create-epi-assignment.dto';
import {
  ReplaceEpiAssignmentDto,
  ReturnEpiAssignmentDto,
} from './dto/return-epi-assignment.dto';
import { UpdateEpiAssignmentDto } from './dto/update-epi-assignment.dto';
import { EpiAssignmentsService } from './epi-assignments.service';
import { Authorize } from '../auth/authorize.decorator';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

@Controller('epi-assignments')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class EpiAssignmentsController {
  constructor(private readonly assignmentsService: EpiAssignmentsService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_epi_assignments')
  create(
    @Body() createDto: CreateEpiAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.create(createDto, req.user?.id);
  }

  @Get()
  @Authorize('can_view_epi_assignments')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: 'entregue' | 'devolvido' | 'substituido',
    @Query('user_id') userId?: string,
    @Query('epi_id') epiId?: string,
  ) {
    return this.assignmentsService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
      user_id: userId,
      epi_id: epiId,
    });
  }

  @Get('summary')
  @Authorize('can_view_epi_assignments')
  getSummary() {
    return this.assignmentsService.getSummary();
  }

  @Get(':id')
  @Authorize('can_view_epi_assignments')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.assignmentsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_epi_assignments')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEpiAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.update(id, dto, req.user?.id);
  }

  @Post(':id/return')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_epi_assignments')
  returnAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReturnEpiAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.returnAssignment(id, dto, req.user?.id);
  }

  @Post(':id/replace')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_epi_assignments')
  replaceAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReplaceEpiAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.assignmentsService.replaceAssignment(id, dto, req.user?.id);
  }
}
