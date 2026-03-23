import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Req,
  NotFoundException,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from '../entities/user-session.entity';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RedisService } from '../../common/redis/redis.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';
import { TenantOptional } from '../../common/decorators/tenant-optional.decorator';

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
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(
    @InjectRepository(UserSession)
    private userSessionRepository: Repository<UserSession>,
    private redisService: RedisService,
    private securityAudit: SecurityAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  async findAll(@Req() req: SessionRequest) {
    const userId = req.user.userId;

    const sessions = await this.userSessionRepository.find({
      where: { user_id: userId, is_active: true },
      order: { last_active: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      ip: session.ip,
      device: session.device,
      location:
        `${session.city || ''}, ${session.state || ''}, ${session.country || ''}`
          .replace(/^, /, '')
          .replace(/, $/, ''),
      lastActive: session.last_active,
      createdAt: session.created_at,
    }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: SessionRequest,
  ) {
    const userId = req.user.userId;

    const session = await this.userSessionRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    session.is_active = false;
    await this.userSessionRepository.save(session);

    // Revoke the linked refresh token in Redis
    if (session.token_hash) {
      await this.redisService.revokeRefreshToken(userId, session.token_hash);
    }

    this.securityAudit.sessionRevoked(userId, id, userId);
    this.logger.log({ event: 'session_revoked', userId, sessionId: id });

    return { message: 'Session revoked' };
  }

  @Delete()
  @ApiOperation({ summary: 'Revoke all other sessions' })
  @ApiResponse({ status: 200, description: 'All other sessions revoked' })
  async removeAllOthers(@Req() req: SessionRequest) {
    const userId = req.user.userId;

    await this.userSessionRepository.update(
      { user_id: userId, is_active: true },
      { is_active: false },
    );

    // Revoke all refresh tokens in Redis
    await this.redisService.clearAllRefreshTokens(userId);

    this.securityAudit.sessionRevoked(userId, 'all', userId);
    this.logger.log({ event: 'all_sessions_revoked', userId });

    return { message: 'All sessions revoked' };
  }
}
