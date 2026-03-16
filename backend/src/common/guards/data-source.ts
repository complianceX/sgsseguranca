import { DataSource, DataSourceOptions } from 'typeorm';
import { parseBooleanFlag, resolveDbSslOptions } from '../database/db-ssl.util';

const isProduction = process.env.NODE_ENV === 'production';
const sslEnabled = parseBooleanFlag(process.env.DATABASE_SSL);
const sslAllowInsecure =
  parseBooleanFlag(process.env.DATABASE_SSL_ALLOW_INSECURE) ||
  parseBooleanFlag(process.env.BANCO_DE_DADOS_SSL);
const sslCA = process.env.DATABASE_SSL_CA;

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
