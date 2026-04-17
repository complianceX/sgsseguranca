import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProfilesService } from '../../profiles/profiles.service';
import { CompaniesService } from '../../companies/companies.service';

interface InformationSchemaTableRow {
  table_name: string;
}

const isInformationSchemaTableRow = (
  value: unknown,
): value is InformationSchemaTableRow =>
  typeof value === 'object' &&
  value !== null &&
  'table_name' in value &&
  typeof value.table_name === 'string';

const DEFAULT_CACHE_WARMING_DELAY_MS = 5_000;

@Injectable()
export class CacheWarmingService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CacheWarmingService.name);
  private warmupTimer?: NodeJS.Timeout;

  constructor(
    private dataSource: DataSource,
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
  ) {}

  onApplicationBootstrap(): void {
    // Não bloquear o `app.listen()` (Railway considera "down" se não abrir porta a tempo).
    // Warm-up é best-effort e roda com atraso para não competir com o primeiro tráfego.
    const delayMs = getNumberEnv(
      'CACHE_WARMING_DELAY_MS',
      DEFAULT_CACHE_WARMING_DELAY_MS,
    );

    this.clearWarmupTimer();
    this.warmupTimer = setTimeout(() => {
      this.warmupTimer = undefined;
      void this.warm().catch((error) => {
        this.logger.error('Failed to warm up cache', error);
      });
    }, delayMs);
    this.warmupTimer.unref();
  }

  onModuleDestroy(): void {
    this.clearWarmupTimer();
  }

  private async warm(): Promise<void> {
    if (process.env.CACHE_WARMING_ENABLED === 'false') {
      this.logger.warn('Cache warming disabled (CACHE_WARMING_ENABLED=false)');
      return;
    }

    const timeoutMs = getNumberEnv('CACHE_WARMING_TIMEOUT_MS', 5000);

    this.logger.log({
      event: 'cache_warming_started',
      timeoutMs,
    });

    const schemaReady = await this.ensureBaseTablesExist();
    if (!schemaReady) {
      this.logger.warn(
        'Cache warming ignorado: tabelas base ainda não existem (migrations pendentes).',
      );
      return;
    }

    // Pré-carregar caches/lightweight lookups usados no boot e em cron jobs.
    await withTimeout(this.profilesService.findAll(), timeoutMs, 'profiles');
    await withTimeout(
      this.companiesService.findAllActive(),
      timeoutMs,
      'companies_active_ids',
    );

    this.logger.log({ event: 'cache_warming_finished' });
  }

  private async ensureBaseTablesExist(): Promise<boolean> {
    if (!this.dataSource.isInitialized) {
      return false;
    }

    const requiredTables = ['profiles', 'companies'];
    const rows: unknown = await this.dataSource.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1)
      `,
      [requiredTables],
    );

    const tableRows = Array.isArray(rows)
      ? rows.filter(isInformationSchemaTableRow)
      : [];
    const existing = new Set(tableRows.map((row) => row.table_name));
    return requiredTables.every((table) => existing.has(table));
  }

  private clearWarmupTimer(): void {
    if (!this.warmupTimer) {
      return;
    }
    clearTimeout(this.warmupTimer);
    this.warmupTimer = undefined;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  _label: string,
): Promise<T | undefined> {
  const ms = Math.max(100, Math.floor(timeoutMs || 0));
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timeout = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
