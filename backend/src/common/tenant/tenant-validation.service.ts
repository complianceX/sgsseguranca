import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

const DEFAULT_TENANT_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TENANT_VALIDATION_WARMUP_DELAY_MS = 5000;
const DEFAULT_TENANT_VALIDATION_WARMUP_COMPANY_LIMIT = 50;

@Injectable()
export class TenantValidationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TenantValidationService.name);
  private readonly localValidTenants = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private warmupTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.TENANT_VALIDATION_WARMUP_ENABLED === 'false') {
      return;
    }

    const delayMs = this.getNumberEnv(
      'TENANT_VALIDATION_WARMUP_DELAY_MS',
      DEFAULT_TENANT_VALIDATION_WARMUP_DELAY_MS,
    );

    this.clearWarmupTimer();
    this.warmupTimer = setTimeout(() => {
      this.warmupTimer = undefined;
      void this.warmActiveTenants().catch((error) => {
        this.logger.warn({
          event: 'tenant_validation_warmup_failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }, delayMs);
    this.warmupTimer.unref();
  }

  onModuleDestroy(): void {
    this.clearWarmupTimer();
  }

  async assertTenantIsValid(companyId: string): Promise<void> {
    if (!this.isUuid(companyId)) {
      throw new UnauthorizedException(
        'Contexto de empresa inválido. Faça login novamente.',
      );
    }

    if (this.isLocallyValid(companyId)) {
      return;
    }

    const cacheKey = this.getCacheKey(companyId);
    const cached = await this.readDistributedCache(cacheKey);
    if (cached) {
      this.markLocallyValid(companyId);
      return;
    }

    const existing = this.inFlight.get(companyId);
    if (existing) {
      return existing;
    }

    const validationPromise = this.loadAndCacheTenant(companyId).finally(() => {
      this.inFlight.delete(companyId);
    });
    this.inFlight.set(companyId, validationPromise);
    return validationPromise;
  }

  async primeValidTenants(companyIds: string[]): Promise<void> {
    const validCompanyIds = [
      ...new Set(companyIds.filter((value) => this.isUuid(value))),
    ];
    if (validCompanyIds.length === 0) {
      return;
    }

    await Promise.all(
      validCompanyIds.map(async (companyId) => {
        this.markLocallyValid(companyId);
        try {
          await this.cacheManager.set(
            this.getCacheKey(companyId),
            true,
            this.getCacheTtlMs(),
          );
        } catch {
          // melhor esforço
        }
      }),
    );
  }

  private async warmActiveTenants(): Promise<void> {
    const companyLimit = this.getNumberEnv(
      'TENANT_VALIDATION_WARMUP_COMPANY_LIMIT',
      DEFAULT_TENANT_VALIDATION_WARMUP_COMPANY_LIMIT,
    );

    this.logger.log({
      event: 'tenant_validation_warmup_started',
      companyLimit,
    });

    const companies = await this.loadActiveTenantIds(companyLimit);

    await this.primeValidTenants(companies);

    this.logger.log({
      event: 'tenant_validation_warmup_finished',
      companyCount: companies.length,
    });
  }

  private async loadAndCacheTenant(companyId: string): Promise<void> {
    const company = await this.loadActiveTenant(companyId);

    if (!company) {
      throw new UnauthorizedException(
        'Contexto de empresa inválido. Faça login novamente ou selecione uma empresa válida.',
      );
    }

    this.markLocallyValid(companyId);

    try {
      await this.cacheManager.set(
        this.getCacheKey(companyId),
        true,
        this.getCacheTtlMs(),
      );
    } catch {
      // melhor esforço
    }
  }

  private async loadActiveTenant(companyId: string): Promise<string | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query("SET LOCAL app.is_super_admin = 'true'");
      const rows = (await queryRunner.query(
        `SELECT id
           FROM companies
          WHERE id = $1
            AND status = true
          LIMIT 1`,
        [companyId],
      )) as Array<{ id: string }>;
      await queryRunner.commitTransaction();
      return rows[0]?.id ?? null;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async loadActiveTenantIds(limit: number): Promise<string[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query("SET LOCAL app.is_super_admin = 'true'");
      const rows = (await queryRunner.query(
        `SELECT id
           FROM companies
          WHERE status = true
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      )) as Array<{ id: string }>;
      await queryRunner.commitTransaction();
      return rows.map((row) => row.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async readDistributedCache(cacheKey: string): Promise<boolean> {
    try {
      return (await this.cacheManager.get<boolean>(cacheKey)) === true;
    } catch {
      return false;
    }
  }

  private markLocallyValid(companyId: string): void {
    this.localValidTenants.set(companyId, Date.now() + this.getCacheTtlMs());
  }

  private isLocallyValid(companyId: string): boolean {
    const expiresAt = this.localValidTenants.get(companyId);
    if (!expiresAt) {
      return false;
    }

    if (expiresAt <= Date.now()) {
      this.localValidTenants.delete(companyId);
      return false;
    }

    return true;
  }

  private getCacheKey(companyId: string): string {
    return `tenant:valid:${companyId}`;
  }

  private getCacheTtlMs(): number {
    const ttlSeconds = this.getNumberEnv(
      'TENANT_VALIDATION_CACHE_TTL_SECONDS',
      DEFAULT_TENANT_VALIDATION_CACHE_TTL_MS / 1000,
    );
    return ttlSeconds * 1000;
  }

  private getNumberEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : fallback;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private clearWarmupTimer(): void {
    if (!this.warmupTimer) {
      return;
    }
    clearTimeout(this.warmupTimer);
    this.warmupTimer = undefined;
  }
}
