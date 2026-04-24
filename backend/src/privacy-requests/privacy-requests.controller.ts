import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreatePrivacyRequestDto } from './dto/create-privacy-request.dto';
import { UpdatePrivacyRequestDto } from './dto/update-privacy-request.dto';
import { PrivacyRequestsService } from './privacy-requests.service';

type AuthenticatedRequest = ExpressRequest & {
  user?: {
    sub?: string;
    userId?: string;
    roles?: string[];
    role?: string;
  };
};

@Controller('privacy-requests')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
  Role.TRABALHADOR,
)
export class PrivacyRequestsController {
  constructor(
    private readonly privacyRequestsService: PrivacyRequestsService,
  ) {}

  private requireUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.sub ?? req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }
    return userId;
  }

  private isAdmin(req: AuthenticatedRequest): boolean {
    const roleValues = [
      req.user?.role,
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
    ].filter((role): role is string => typeof role === 'string');

    return roleValues.some(
      (role) => role === Role.ADMIN_GERAL || role === Role.ADMIN_EMPRESA,
    );
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePrivacyRequestDto) {
    return this.privacyRequestsService.createForCurrentUser(
      this.requireUserId(req),
      dto,
    );
  }

  @Get('me')
  listMine(@Req() req: AuthenticatedRequest) {
    return this.privacyRequestsService.listMine(this.requireUserId(req));
  }

  @Get()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  listTenant() {
    return this.privacyRequestsService.listTenant();
  }

  @Get(':id/events')
  listEvents(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.privacyRequestsService.listEvents(id, {
      userId: this.requireUserId(req),
      isAdmin: this.isAdmin(req),
    });
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.privacyRequestsService.findOne(id, {
      userId: this.requireUserId(req),
      isAdmin: this.isAdmin(req),
    });
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdatePrivacyRequestDto,
  ) {
    return this.privacyRequestsService.updateStatus(
      id,
      this.requireUserId(req),
      dto,
    );
  }
}
