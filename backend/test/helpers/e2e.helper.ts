import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Connection } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env before importing AppModule
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { AppModule } from '../../src/app.module';
import { PasswordService } from '../../src/common/services/password.service';
import { UsersService } from '../../src/users/users.service';
import { TestHelper } from './test.helper';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';

export class E2EHelper {
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
    if (connection.isInitialized) {
      // Using synchronize(true) drops schema and recreates it
      await connection.synchronize(true);
    }
  }
}
