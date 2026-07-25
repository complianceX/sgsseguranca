import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Authorize } from '../auth/authorize.decorator';
import { TenantService } from '../../shared/tenant/tenant.service';

type RequestWithUser = {
  user: { userId: string; company_id?: string; companyId?: string };
  tenant?: { companyId?: string };
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly tenantService: TenantService,
  ) {}

  private resolveCompanyId(req: RequestWithUser): string {
    const companyId =
      req.tenant?.companyId ||
      req.user.company_id ||
      req.user.companyId ||
      this.tenantService.getTenantId();

    if (!companyId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado. Faça login novamente ou selecione uma empresa.',
      );
    }

    return companyId;
  }

  @Get()
  @Authorize('can_view_notifications')
  findAll(
    @Request() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAll(
      req.user.userId,
      this.resolveCompanyId(req),
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @Authorize('can_view_notifications')
  getUnreadCount(@Request() req: RequestWithUser) {
    return this.notificationsService.getUnreadCount(
      req.user.userId,
      this.resolveCompanyId(req),
    );
  }

  @Patch(':id/read')
  @Authorize('can_manage_notifications')
  markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.notificationsService.markAsRead(
      id,
      req.user.userId,
      this.resolveCompanyId(req),
    );
  }

  @Post('read-all')
  @Authorize('can_manage_notifications')
  markAllAsRead(@Request() req: RequestWithUser) {
    return this.notificationsService.markAllAsRead(
      req.user.userId,
      this.resolveCompanyId(req),
    );
  }
}
