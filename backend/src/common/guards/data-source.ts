import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

// SECURITY: Carrega variáveis de ambiente conforme o NODE_ENV; garante configuração correta
config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/db/migrations/*.js'],
  // SECURITY: Força SSL em produção/staging; impede conexões inseguras suscetíveis a MITM
  ssl: ['production', 'staging'].includes(process.env.NODE_ENV ?? '')
    ? {
        // SECURITY: Exige certificado válido do servidor (sem self-signed não confiável)
        rejectUnauthorized: true,
        // SECURITY: CA do Railway/DB via variável de ambiente, nunca hardcoded
        // Pode ser conteúdo PEM (possivelmente Base64) — usar DATABASE_SSL_CA
        ca: process.env.DATABASE_SSL_CA ?? undefined,
      }
    : false, // Em desenvolvimento, pode ser desabilitado se o DB for local.
};

// SECURITY: DataSource isolado para migrations com SSL seguro
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
