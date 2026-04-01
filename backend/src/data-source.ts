import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  parseBooleanFlag,
  resolveDbSslOptions,
} from './common/database/db-ssl.util';

// Suporte a DATABASE_URL (Railway/Render/Supabase pooler) ou variaveis individuais
const rawUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.URL_DO_BANCO_DE_DADOS;

function normalizeDatabaseUrlForPg(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return url;
  }
}

const url = normalizeDatabaseUrlForPg(rawUrl);

function getSslConfig() {
  // This file is used by TypeORM CLI for migrations and is eagerly imported
  // by migration-startup.guard.ts. In test/CI environments NODE_ENV may be
  // 'production' at the Jest process level but no real database is configured.
  // We treat the lack of any database config as a signal that SSL validation
  // should be skipped (returns false), so module-level instantiation below
  // does not throw during unit-test imports.
  const isTest =
    process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
  if (isTest) {
    return false;
  }
  const isProduction = process.env.NODE_ENV === 'production';
  const railwaySelfSigned = parseBooleanFlag(process.env.BANCO_DE_DADOS_SSL);
  const sslAllowInsecure = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_INSECURE,
  );
  const sslEnabled = parseBooleanFlag(process.env.DATABASE_SSL);
  const sslCA = process.env.DATABASE_SSL_CA;
  return resolveDbSslOptions({
    isProduction,
    sslEnabled,
    sslCA,
    allowInsecure: sslAllowInsecure || railwaySelfSigned,
  });
}

export default new DataSource(
  url
    ? {
        type: 'postgres',
        url,
        ssl: getSslConfig(),
        // Glob preciso: exclui diretórios que não contêm entities de domínio.
        // A estrutura dist/ espelha src/ sem o prefixo src/ (rootDir: "src").
        entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
        migrations: ['dist/database/migrations/*.js'],
      }
    : {
        type: 'postgres',
        host:
          process.env.DATABASE_HOST ||
          process.env.PGHOST ||
          process.env.POSTGRES_HOST ||
          'localhost',
        port:
          Number(
            process.env.DATABASE_PORT ||
              process.env.PGPORT ||
              process.env.POSTGRES_PORT,
          ) || 5432,
        username:
          process.env.DATABASE_USER ||
          process.env.PGUSER ||
          process.env.POSTGRES_USER,
        password:
          process.env.DATABASE_PASSWORD ||
          process.env.PGPASSWORD ||
          process.env.POSTGRES_PASSWORD,
        database:
          process.env.DATABASE_NAME ||
          process.env.PGDATABASE ||
          process.env.POSTGRES_DB,
        ssl: getSslConfig(),
        entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
        migrations: ['dist/database/migrations/*.js'],
      },
);
