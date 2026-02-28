import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ProfilesService } from '../../profiles/profiles.service';
import { CompaniesService } from '../../companies/companies.service';

@Injectable()
export class CacheWarmingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CacheWarmingService.name);

  constructor(
    private profilesService: ProfilesService,
    private companiesService: CompaniesService,
  ) {}

  async onApplicationBootstrap() {
    // Não bloquear o `app.listen()` (Railway considera "down" se não abrir porta a tempo).
    // Warm-up é best-effort e pode depender de Redis/DB; portanto roda em background.
    setImmediate(() => {
      void this.warm().catch((error) => {
        this.logger.error('Failed to warm up cache', error);
      });
    });
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

    // Pré-carregar dados estáticos (best-effort).
    await withTimeout(this.profilesService.findAll(), timeoutMs, 'profiles');
    await withTimeout(this.companiesService.findAll(), timeoutMs, 'companies');

    this.logger.log({ event: 'cache_warming_finished' });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
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
