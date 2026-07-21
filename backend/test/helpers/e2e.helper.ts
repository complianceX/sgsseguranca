import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Connection } from 'typeorm';
import * as net from 'net';
import { bootstrapBackendTestEnvironment } from '../setup/test-env';

// Load test env before importing AppModule
bootstrapBackendTestEnvironment();

import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/shared/services/password.service';
import { UsersService } from '../../src/modules/users/users.service';
import { TestHelper } from './test.helper';
import { AllExceptionsFilter } from '../../src/shared/filters/http-exception.filter';

function canConnect(
  host: string,
  port: number,
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export class E2EHelper {
  /**
   * Verifica se Postgres e Redis estão acessíveis.
   * Usado para pular testes E2E quando a infra não está disponível.
   */
  static async isInfraAvailable(): Promise<boolean> {
    const dbHost = process.env.DATABASE_HOST || '127.0.0.1';
    const dbPort = Number(process.env.DATABASE_PORT || 5433);
    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = Number(process.env.REDIS_PORT || 6379);
    const [db, redis] = await Promise.all([
      canConnect(dbHost, dbPort),
      canConnect(redisHost, redisPort),
    ]);
    return db && redis;
  }

  static async createTestApp() {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PasswordService)
      .useValue({
        hash: jest.fn().mockResolvedValue('hashed_password'),
        compare: jest.fn().mockImplementation((plain) => {
          return plain === 'password123' || plain === 'admin-pass';
        }),
        validate: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      })
      .compile();

    const app = moduleFixture.createNestApplication();

    // Aplicar mesmas configurações do main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    return app;
  }

  static async seedDatabase(app: INestApplication) {
    const usersService = app.get(UsersService);

    // Create standard user
    try {
      await usersService.create({
        ...TestHelper.mockUser(),
        password: 'password123',
      });
    } catch {
      // Ignore if already exists
    }

    // Create admin user
    try {
      await usersService.create({
        nome: 'Admin User',
        cpf: 'admin-cpf',
        email: 'admin@example.com',
        password: 'admin-pass',
        company_id: 'company-123',
        profile_id: 'profile-123', // Assuming this profile exists or is created
        status: true,
      });
    } catch {
      // Ignore if already exists
    }
  }

  static async cleanDatabase(app: INestApplication) {
    const connection = app.get(Connection);
    if (!connection.isInitialized) {
      return;
    }

    // Limpa os DADOS preservando o schema.
    //
    // A versão anterior chamava `synchronize(true)`, que derruba e recria o
    // schema a partir das entities — descartando tudo que só existe em
    // migration, com destaque para as policies de RLS. Depois dessa chamada os
    // testes seguiam rodando contra um banco sem isolamento multi-tenant,
    // justamente o que boa parte deles deveria verificar.
    if (connection.options.type === 'postgres') {
      await connection.query(`
        DO $$
        DECLARE
          table_names TEXT;
        BEGIN
          SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
          INTO table_names
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename <> 'migrations';

          IF table_names IS NOT NULL THEN
            EXECUTE 'TRUNCATE TABLE ' || table_names || ' RESTART IDENTITY CASCADE';
          END IF;
        END $$;
      `);
      return;
    }

    await connection.synchronize(true);
  }
}
