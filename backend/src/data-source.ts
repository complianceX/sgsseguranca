import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Suporte a DATABASE_URL (Railway/Heroku) ou variáveis individuais
const url = process.env.DATABASE_URL;

function getSslConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  const railwaySelfSigned = process.env.BANCO_DE_DADOS_SSL === 'true';
  const sslEnabled = process.env.DATABASE_SSL === 'true';
  const sslCA = process.env.DATABASE_SSL_CA;

  if (!isProduction) {
    return sslEnabled ? { rejectUnauthorized: false } : false;
  }

  if (railwaySelfSigned) {
    return { rejectUnauthorized: false };
  }

  if (hasDatabaseUrl && !sslCA) {
    return { rejectUnauthorized: false };
  }

  if (!sslEnabled) {
    return false;
  }

  if (sslCA) {
    return { rejectUnauthorized: true, ca: sslCA };
  }

  return { rejectUnauthorized: true };
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
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT) || 5432,
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        ssl: getSslConfig(),
        entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
        migrations: ['dist/database/migrations/*.js'],
      },
);
