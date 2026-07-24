import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

/**
 * Conexao DEDICADA para operacoes privilegiadas (cross-tenant) — etapa 2 do
 * hardening de bypass de RLS. Ver backend/docs/RUNBOOK_RLS_BYPASS_HARDENING.md.
 *
 * Autentica com a role `sgs_admin` (membro de `sgs_rls_bypass`) via
 * DATABASE_ADMIN_URL, SEPARADA da conexao de runtime (`sgs_app`). Quando o
 * bypass for revogado do `sgs_app`, as operacoes legitimas que precisam de
 * acesso cross-tenant (exclusao LGPD, trilha forense, jobs sem tenant)
 * continuam funcionando por aqui, e o runtime comum perde o poder de escalar.
 *
 * DORMENTE por padrao: se DATABASE_ADMIN_URL nao estiver setada, isEnabled()
 * retorna false e NADA e inicializado (nenhum pool, nenhuma conexao). Callers
 * devem checar isEnabled() e cair no comportamento atual (bypass na conexao
 * comum) enquanto a conexao dedicada nao existir no ambiente. Isso torna o
 * rollout incremental e seguro: deployar este codigo com a env ausente nao muda
 * nada; setar DATABASE_ADMIN_URL (etapa 3, em janela) ativa o caminho dedicado.
 */
@Injectable()
export class PrivilegedDbService implements OnModuleDestroy {
  private readonly logger = new Logger(PrivilegedDbService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  private get adminUrl(): string {
    return (this.config.get<string>('DATABASE_ADMIN_URL') ?? '').trim();
  }

  /** True somente quando DATABASE_ADMIN_URL esta configurada. */
  isEnabled(): boolean {
    return this.adminUrl.length > 0;
  }

  private getPool(): Pool {
    if (!this.isEnabled()) {
      throw new Error(
        'PrivilegedDbService: DATABASE_ADMIN_URL nao configurada. A conexao privilegiada esta dormente.',
      );
    }
    if (!this.pool) {
      const url = this.adminUrl;
      const requireSsl =
        /sslmode=require/i.test(url) ||
        String(this.config.get('DATABASE_SSL') ?? '').toLowerCase() === 'true';
      const allowInsecure =
        String(
          this.config.get('DATABASE_SSL_ALLOW_INSECURE') ?? '',
        ).toLowerCase() === 'true';
      const max = Number(this.config.get('DATABASE_ADMIN_POOL_MAX') ?? 3);

      this.pool = new Pool({
        connectionString: url,
        ssl: requireSsl ? { rejectUnauthorized: !allowInsecure } : undefined,
        max: Number.isFinite(max) && max > 0 ? max : 3,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      });
      this.pool.on('error', (err: Error) => {
        this.logger.error(
          `Erro no pool privilegiado (sgs_admin): ${err.message}`,
        );
      });
      this.logger.log('Conexao privilegiada (sgs_admin) inicializada.');
    }
    return this.pool;
  }

  /**
   * Executa `fn` com um client da conexao privilegiada. O client ja vem com
   * statement_timeout aplicado. O caller e responsavel pela transacao e por
   * qualquer `SET LOCAL app.is_super_admin = 'true'` que a operacao exigir.
   * Lanca se a conexao dedicada nao estiver configurada (checar isEnabled()).
   */
  async withPrivilegedClient<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.getPool().connect();
    try {
      await client.query("SET statement_timeout = '30000'");
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
  }
}
