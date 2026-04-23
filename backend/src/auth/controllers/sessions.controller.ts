import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { TenantOptional } from '../../common/decorators/tenant-optional.decorator';
import { SessionsService } from '../services/sessions.service';
import { AuditAction as ForensicAuditAction } from '../../common/decorators/audit-action.decorator';
import { AuthzOptional } from '../authz-optional.decorator';

interface SessionRequest {
  user: {
    userId: string;
  };
}

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard)
@TenantOptional()
@AuthzOptional()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async findAll(@Req() req: SessionRequest) {
    return this.sessionsService.findAllActive(req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ForensicAuditAction('delete', 'session')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: SessionRequest,
  ) {
    await this.sessionsService.revokeOne(id, req.user.userId);
    return { message: 'Session revoked' };
  }

  @Delete()
  @ApiOperation({ summary: 'Revoke all other sessions' })
  @ApiResponse({ status: 200, description: 'All other sessions revoked' })
  @ForensicAuditAction('delete', 'session')
  async removeAllOthers(@Req() req: SessionRequest) {
    await this.sessionsService.revokeAllOthers(req.user.userId);
    return { message: 'All sessions revoked' };
  }
}
