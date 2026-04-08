import 'reflect-metadata';
import { DataSource } from 'typeorm';
import {
  parseBooleanFlag,
  resolveDbSslOptions,
} from './common/database/db-ssl.util';

// Para migrations: preferir DATABASE_DIRECT_URL (Supabase direct, porta 5432).
// Supabase usa PgBouncer em transaction mode na porta 6543 — incompatível com
// CREATE INDEX CONCURRENTLY e SET LOCAL (usados nas migrations).
// A porta 5432 (direct) não passa pelo PgBouncer e suporta transações longas.
//
// Configuração recomendada no Render (web + worker):
//   DATABASE_URL         = postgresql://...@aws-*.pooler.supabase.com:6543/postgres (PgBouncer)
//   DATABASE_DIRECT_URL  = postgresql://...@aws-*.supabase.com:5432/postgres (direct)
//
// O TypeORM CLI (migrations) usa DATABASE_DIRECT_URL se disponível.
// O app em runtime usa DATABASE_URL (pooler) para queries de curta duração.
const rawUrl =
  process.env.DATABASE_DIRECT_URL || // Supabase direct connection (para migrations)
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
  const sslAllowInsecureRequested = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_INSECURE,
  );
  const sslAllowInsecureForced = parseBooleanFlag(
    process.env.DATABASE_SSL_ALLOW_INSECURE_FORCE,
  );
  const sslAllowInsecure =
    sslAllowInsecureForced || (isProduction && sslAllowInsecureRequested);
  const sslEnabled = parseBooleanFlag(process.env.DATABASE_SSL);
  const sslCA = process.env.DATABASE_SSL_CA;
  return resolveDbSslOptions({
    isProduction,
    sslEnabled: sslEnabled || railwaySelfSigned,
    sslCA,
    allowInsecure: sslAllowInsecure,
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
