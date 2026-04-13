import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../auth/entities/user-session.entity';
import { Company } from '../companies/entities/company.entity';
import { DashboardDocumentAvailabilitySnapshotService } from './dashboard-document-availability-snapshot.service';
import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';

const DEFAULT_WARMUP_DELAY_MS = 15_000;
const DEFAULT_WARMUP_COMPANY_LIMIT = 25;
const DEFAULT_WARMUP_CONCURRENCY = 3;

@Injectable()
export class DashboardDocumentAvailabilityWarmupService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    DashboardDocumentAvailabilityWarmupService.name,
  );
  private inFlightWarmup: Promise<void> | null = null;

  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly snapshotService: DashboardDocumentAvailabilitySnapshotService,
    private readonly documentPendenciesService: DashboardDocumentPendenciesService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_ENABLED === 'false') {
      this.logger.warn(
        'Dashboard document availability warmup disabled (DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_ENABLED=false)',
      );
      return;
    }

    const delayMs = this.getNumberEnv(
      'DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_DELAY_MS',
      DEFAULT_WARMUP_DELAY_MS,
    );

    setTimeout(() => {
      void this.warm().catch((error) => {
        this.logger.error(
          `Failed to warm dashboard document availability snapshots: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, delayMs);
  }

  async warm(): Promise<void> {
    if (this.inFlightWarmup) {
      return this.inFlightWarmup;
    }

    const warmupPromise = this.runWarmup().finally(() => {
      this.inFlightWarmup = null;
    });
    this.inFlightWarmup = warmupPromise;
    await warmupPromise;
  }

  async primeCompanies(companyIds: string[]): Promise<void> {
    const uniqueCompanyIds = [
      ...new Set(companyIds.filter((value) => this.isUuid(value))),
    ];
    if (uniqueCompanyIds.length === 0) {
      return;
    }

    const concurrency = this.getNumberEnv(
      'DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY',
      DEFAULT_WARMUP_CONCURRENCY,
    );

    await this.mapWithConcurrency(
      uniqueCompanyIds,
      concurrency,
      async (companyId) => {
        await this.snapshotService.ensureSnapshotsAvailable({
          companyId,
          shouldCollect: true,
        });
        await this.documentPendenciesService.warmPreparedBaseCache({
          companyId,
        });
      },
    );
  }

  private async runWarmup(): Promise<void> {
    const companyLimit = this.getNumberEnv(
      'DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_COMPANY_LIMIT',
      DEFAULT_WARMUP_COMPANY_LIMIT,
    );
    const concurrency = this.getNumberEnv(
      'DASHBOARD_DOCUMENT_AVAILABILITY_WARMUP_CONCURRENCY',
      DEFAULT_WARMUP_CONCURRENCY,
    );

    this.logger.log({
      event: 'dashboard_document_availability_warmup_started',
      companyLimit,
      concurrency,
    });

    const companyIds = await this.resolveWarmupCompanyIds(companyLimit);
    await this.mapWithConcurrency(companyIds, concurrency, async (companyId) => {
      try {
        await this.snapshotService.ensureSnapshotsAvailable({
          companyId,
          shouldCollect: true,
        });
        await this.documentPendenciesService.warmPreparedBaseCache({
          companyId,
        });
      } catch (error) {
        this.logger.warn({
          event: 'dashboard_document_availability_warmup_company_failed',
          companyId,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.logger.log({
      event: 'dashboard_document_availability_warmup_finished',
      companyCount: companyIds.length,
    });
  }

  private async resolveWarmupCompanyIds(companyLimit: number): Promise<string[]> {
    const activeSessionRows = await this.userSessionRepository.find({
      where: {
        is_active: true,
        revoked_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
      select: {
        company_id: true,
        last_active: true,
      },
      order: { last_active: 'DESC' },
      take: companyLimit,
    });

    const activeCompanyIds = [
      ...new Set(activeSessionRows.map((row) => row.company_id)),
    ];
    if (activeCompanyIds.length >= companyLimit) {
      return activeCompanyIds.slice(0, companyLimit);
    }

    const recentCompanies = await this.companiesRepository.find({
      where: { status: true },
      select: ['id'],
      order: { created_at: 'DESC' },
      take: companyLimit,
    });

    return [...new Set([...activeCompanyIds, ...recentCompanies.map((c) => c.id)])].slice(
      0,
      companyLimit,
    );
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
    values: T[],
    limit: number,
    worker: (value: T, index: number) => Promise<void>,
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }

    const normalizedLimit = Math.max(1, Math.floor(limit));
    let nextIndex = 0;

    await Promise.all(
      Array.from(
        { length: Math.min(normalizedLimit, values.length) },
        async () => {
          while (true) {
            const currentIndex = nextIndex++;
            if (currentIndex >= values.length) {
              return;
            }

            await worker(values[currentIndex], currentIndex);
          }
        },
      ),
    );
  }
}
