import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../entities/user-session.entity';
import { AuthRedisService } from '../../common/redis/redis.service';
import { SecurityAuditService } from '../../common/security/security-audit.service';

export interface SessionView {
  id: string;
  ip: string;
  device: string;
  location: string;
  lastActive: Date;
  createdAt: Date;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    private readonly redisService: AuthRedisService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  async findAllActive(userId: string): Promise<SessionView[]> {
    const sessions = await this.userSessionRepository.find({
      where: {
        user_id: userId,
        is_active: true,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      order: { last_active: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      ip: session.ip,
      device: session.device || 'unknown',
      location:
        `${session.city || ''}, ${session.state || ''}, ${session.country || ''}`
          .replace(/^, /, '')
          .replace(/, $/, ''),
      lastActive: session.last_active,
      createdAt: session.created_at,
    }));
  }

  async revokeOne(id: string, userId: string): Promise<void> {
    const session = await this.userSessionRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    session.is_active = false;
    session.revoked_at = new Date();
    await this.userSessionRepository.save(session);

    if (session.token_hash) {
      await this.redisService.revokeRefreshToken(userId, session.token_hash);
    }

    this.securityAudit.sessionRevoked(userId, id, userId);
    this.logger.log({ event: 'session_revoked', userId, sessionId: id });
  }

  async revokeAllOthers(userId: string): Promise<void> {
    await this.userSessionRepository.update(
      { user_id: userId, is_active: true },
      { is_active: false, revoked_at: new Date() },
    );

    await this.redisService.clearAllRefreshTokens(userId);

    this.securityAudit.sessionRevoked(userId, 'all', userId);
    this.logger.log({ event: 'all_sessions_revoked', userId });
  }
}
