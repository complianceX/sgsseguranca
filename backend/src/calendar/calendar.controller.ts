import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Authorize } from '../auth/authorize.decorator';
import { Role } from '../auth/enums/roles.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CalendarService } from './calendar.service';
import { CalendarEventsQueryDto } from './dto/calendar-events-query.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_calendar')
  async getEvents(
    @Query() query: CalendarEventsQueryDto,
    @Req()
    req: Request & {
      user?: {
        permissions?: string[];
      };
    },
  ) {
    const now = new Date();
    const y = query.year ?? now.getFullYear();
    const m = query.month ?? now.getMonth() + 1;
    const events = await this.calendarService.getEvents(
      y,
      m,
      req.user?.permissions ?? [],
    );
    return { data: events, year: y, month: m };
  }
}
