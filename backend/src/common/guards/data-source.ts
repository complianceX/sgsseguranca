import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

// SECURITY: Carrega variáveis de ambiente conforme o NODE_ENV; garante configuração correta
config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  ssl:
    process.env.BANCO_DE_DADOS_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
};

// SECURITY: DataSource isolado para migrations com SSL seguro
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
