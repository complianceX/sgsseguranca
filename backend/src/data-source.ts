import 'reflect-metadata';
import { DataSource } from 'typeorm';

const useRailwaySsl = process.env.BANCO_DE_DADOS_SSL === 'true';

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.URL_DO_BANCO_DE_DADOS;

const isTsRuntime = __filename.endsWith('.ts');

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  host: process.env.DATABASE_HOST || process.env.PGHOST,
  port: Number(process.env.DATABASE_PORT || process.env.PGPORT || 5432),
  username: process.env.DATABASE_USER || process.env.PGUSER,
  password: process.env.DATABASE_PASSWORD || process.env.PGPASSWORD,
  database: process.env.DATABASE_NAME || process.env.PGDATABASE,
  ssl: useRailwaySsl ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: isTsRuntime ? ['src/**/*.entity.ts'] : ['dist/**/*.entity.js'],
  migrations: isTsRuntime
    ? ['src/database/migrations/*.ts']
    : ['dist/database/migrations/*.js'],
});
