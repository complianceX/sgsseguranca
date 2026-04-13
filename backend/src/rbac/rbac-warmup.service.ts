import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { User } from '../users/entities/user.entity';
import { RbacService } from './rbac.service';

const DEFAULT_RBAC_WARMUP_DELAY_MS = 10000;
const DEFAULT_RBAC_WARMUP_USER_LIMIT = 50;
const DEFAULT_RBAC_WARMUP_CONCURRENCY = 4;

@Injectable()
export class RbacWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RbacWarmupService.name);

  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly rbacService: RbacService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.RBAC_WARMUP_ENABLED === 'false') {
      return;
    }

    const delayMs = this.getNumberEnv(
      'RBAC_WARMUP_DELAY_MS',
      DEFAULT_RBAC_WARMUP_DELAY_MS,
    );

    setTimeout(() => {
      void this.warmRecentUsers().catch((error) => {
        this.logger.warn({
          event: 'rbac_warmup_failed',
          errorMessage:
            error instanceof Error ? error.message : String(error),
        });
      });
    }, delayMs);
  }

  async primeUsers(userIds: string[]): Promise<void> {
    const uniqueUserIds = [...new Set(userIds.filter((value) => this.isUuid(value)))];
    if (uniqueUserIds.length === 0) {
      return;
    }

    const concurrency = this.getNumberEnv(
      'RBAC_WARMUP_CONCURRENCY',
      DEFAULT_RBAC_WARMUP_CONCURRENCY,
    );

    await this.mapWithConcurrency(
      uniqueUserIds,
      concurrency,
      async (userId) => {
        await this.rbacService.getUserAccess(userId);
      },
    );
  }

  private async warmRecentUsers(): Promise<void> {
    const userLimit = this.getNumberEnv(
      'RBAC_WARMUP_USER_LIMIT',
      DEFAULT_RBAC_WARMUP_USER_LIMIT,
    );

    this.logger.log({
      event: 'rbac_warmup_started',
      userLimit,
    });

    const activeSessionRows = await this.userSessionRepository.find({
      where: {
        is_active: true,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      select: {
        user_id: true,
        last_active: true,
      },
      order: { last_active: 'DESC' },
      take: userLimit,
    });

    const activeUserIds = [...new Set(activeSessionRows.map((row) => row.user_id))];

    if (activeUserIds.length >= userLimit) {
      await this.primeUsers(activeUserIds.slice(0, userLimit));
      this.logger.log({
        event: 'rbac_warmup_finished',
        source: 'active_sessions',
        userCount: Math.min(activeUserIds.length, userLimit),
      });
      return;
    }

    const fallbackUsers = await this.usersRepository.find({
      where: { status: true },
      select: { id: true },
      order: { updated_at: 'DESC' },
      take: userLimit,
    });

    const fallbackUserIds = fallbackUsers.map((user) => user.id);
    const mergedUserIds = [...new Set([...activeUserIds, ...fallbackUserIds])].slice(
      0,
      userLimit,
    );

    await this.primeUsers(mergedUserIds);

    this.logger.log({
      event: 'rbac_warmup_finished',
      source: activeUserIds.length > 0 ? 'mixed' : 'recent_users',
      userCount: mergedUserIds.length,
    });
  }

  private getNumberEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async mapWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
    let cursor = 0;

    const runners = Array.from(
      { length: Math.min(normalizedConcurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const currentIndex = cursor++;
          try {
            await worker(items[currentIndex]);
          } catch {
            // Warmup é melhor esforço; falhas isoladas não devem abortar o lote.
          }
        }
      },
    );

    await Promise.all(runners);
  }
}
