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
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Authorize } from '../auth/authorize.decorator';

type RequestWithUser = {
  user: { userId: string; company_id?: string; companyId?: string };
};

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Authorize('can_view_notifications')
  findAll(
    @Request() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const companyId = req.user.company_id || req.user.companyId || '';
    return this.notificationsService.findAll(
      req.user.userId,
      companyId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('unread-count')
  @Authorize('can_view_notifications')
  getUnreadCount(@Request() req: RequestWithUser) {
    const companyId = req.user.company_id || req.user.companyId || '';
    return this.notificationsService.getUnreadCount(req.user.userId, companyId);
  }

  @Patch(':id/read')
  @Authorize('can_manage_notifications')
  markAsRead(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: RequestWithUser,
  ) {
    const companyId = req.user.company_id || req.user.companyId || '';
    return this.notificationsService.markAsRead(id, req.user.userId, companyId);
  }

  @Post('read-all')
  @Authorize('can_manage_notifications')
  markAllAsRead(@Request() req: RequestWithUser) {
    const companyId = req.user.company_id || req.user.companyId || '';
    return this.notificationsService.markAllAsRead(req.user.userId, companyId);
  }
}
