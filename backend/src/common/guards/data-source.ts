import { DataSource, DataSourceOptions } from 'typeorm';
import {
  doesDatabaseUrlRequireSsl,
  parseBooleanFlag,
  resolveDbSslOptions,
} from '../database/db-ssl.util';

const isProduction = process.env.NODE_ENV === 'production';
const legacySslEnabled = parseBooleanFlag(process.env.BANCO_DE_DADOS_SSL);
const sslAllowInsecureRequested = parseBooleanFlag(
  process.env.DATABASE_SSL_ALLOW_INSECURE,
);
const sslAllowInsecureForced = parseBooleanFlag(
  process.env.DATABASE_SSL_ALLOW_INSECURE_FORCE,
);
const sslAllowInsecure =
  sslAllowInsecureForced || (isProduction && sslAllowInsecureRequested);
const sslCA = process.env.DATABASE_SSL_CA;
const rawDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_PUBLIC_URL ||
  process.env.URL_DO_BANCO_DE_DADOS;
const sslEnabled =
  parseBooleanFlag(process.env.DATABASE_SSL) ||
  legacySslEnabled ||
  doesDatabaseUrlRequireSsl(rawDatabaseUrl);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL ||
    process.env.URL_DO_BANCO_DE_DADOS,
  ssl: resolveDbSslOptions({
    isProduction,
    sslEnabled,
    sslCA,
    allowInsecure: sslAllowInsecure,
  }),
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
