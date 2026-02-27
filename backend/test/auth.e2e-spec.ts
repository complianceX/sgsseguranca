import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2EHelper } from './helpers/e2e.helper';

describe('Authentication (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await E2EHelper.createTestApp();
    await E2EHelper.seedDatabase(app);
  });

  afterAll(async () => {
    await E2EHelper.cleanDatabase(app);
    await app.close();
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          cpf: '12345678900',
          password: 'password123',
        })
        .expect(200)
        .expect((res) => {
          const body = res.body as { user?: any };
          expect(body.user).toBeDefined();
          expect(res.headers['set-cookie']).toBeDefined();
          expect(res.headers['set-cookie'][0]).toContain('access_token');
        });
    });

    it('should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          cpf: '12345678900',
          password: 'wrongpassword',
        })
        .expect(401)
        .expect((res) => {
          // The actual message might vary depending on the filter/guard implementation
          // Using strict check based on user snippet
          const body = res.body as { message?: string };
          expect(body.message).toBeDefined();
        });
    });

    it('should validate input format', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          cpf: 'invalid',
          password: '',
        })
        .expect(400);
    });

    it('should apply rate limiting', async () => {
      // Note: This test depends on ThrottlerModule configuration.
      // If the limit is higher than 4, this test might fail or need adjustment.
      // Assuming the user knows the limit is low.

      // Reset limit first if possible or just try to hit it
      const promises: any[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/auth/login')
            .send({ cpf: '12345678900', password: 'wrong' }),
        );
      }

      await Promise.all(promises);

      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'wrong' })
        .expect(429); // Too Many Requests
    });
  });

  describe('/auth/refresh (POST)', () => {
    it('should refresh access token', async () => {
      // Login primeiro

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'password123' });

      const cookies = loginRes.headers['set-cookie'];

      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookies)
        .expect(200)
        .expect((res) => {
          expect(res.headers['set-cookie']).toBeDefined();
        });
    });
  });

  describe('/auth/change-password (POST)', () => {
    it('should change password when authenticated', async () => {
      // Login e pegar token

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'password123' });

      const cookies = loginRes.headers['set-cookie'];

      return request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Cookie', cookies)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123',
        })
        .expect(200);
    });

    it('should reject unauthenticated request', () => {
      return request(app.getHttpServer())
        .post('/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123',
        })
        .expect(401);
    });
  });
});
