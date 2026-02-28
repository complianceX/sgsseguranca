import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Suporte a DATABASE_URL (Railway/Heroku) ou variáveis individuais
const url = process.env.DATABASE_URL;

export default new DataSource(
  url
    ? {
        type: 'postgres',
        url,
        ssl: { rejectUnauthorized: false },
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
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        entities: ['dist/!(database|seed|queue|worker)/**/*.entity.js'],
        migrations: ['dist/database/migrations/*.js'],
      },
);
