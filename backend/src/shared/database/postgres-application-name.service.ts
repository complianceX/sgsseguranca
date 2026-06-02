import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

type PgPoolClient = {
  query: (sql: string) => unknown;
};

type PgPool = {
  on?: (event: string, listener: (client: PgPoolClient) => void) => void;
};

type PromiseLikeWithCatch = {
  catch: (onRejected: (error: unknown) => void) => unknown;
};

function hasCatchMethod(value: unknown): value is PromiseLikeWithCatch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'catch' in value &&
    typeof value.catch === 'function'
  );
}

function firstNonEmpty(
  values: Array<string | undefined | null>,
): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

@Injectable()
export class PostgresApplicationNameService implements OnModuleInit {
  private readonly logger = new Logger(PostgresApplicationNameService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    const applicationName = firstNonEmpty([
      this.config.get<string>('DB_APPLICATION_NAME_WEB'),
      this.config.get<string>('DB_APPLICATION_NAME_WORKER'),
      this.config.get<string>('DB_APPLICATION_NAME'),
    ]);

    if (!applicationName) {
      this.logger.warn(
        'DB_APPLICATION_NAME* ausente; hook de segmentação de conexão não será aplicado.',
      );
      return;
    }

    const escapedApplicationName = applicationName.replace(/'/g, "''");
    const setApplicationNameSql = `SET application_name = '${escapedApplicationName}'`;
    const driver = this.dataSource.driver as unknown as { master?: PgPool };
    const pool = driver.master;

    if (pool?.on) {
      pool.on('connect', (client: PgPoolClient) => {
        try {
          const maybePromise = client.query(setApplicationNameSql);
          if (hasCatchMethod(maybePromise)) {
            void maybePromise.catch((error: unknown) => {
              this.logger.warn(
                `Falha ao aplicar application_name em nova conexão: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
          }
        } catch (error: unknown) {
          this.logger.warn(
            `Erro no hook de conexão do PostgreSQL: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      });
    } else {
      this.logger.warn(
        'Pool PostgreSQL não expõe evento connect; aplicação em conexões novas pode ficar limitada.',
      );
    }

    try {
      await this.dataSource.query(setApplicationNameSql);
      this.logger.log(
        `application_name forçado para "${applicationName}" na conexão ativa.`,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Não foi possível forçar application_name na conexão ativa: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
