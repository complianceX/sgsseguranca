import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2EHelper } from './helpers/e2e.helper';

// Pula toda a suite quando Postgres ou Redis não estão disponíveis
const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('Authentication (e2e)', () => {
  let app: INestApplication;
  const getHttpServer = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

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
      return request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'password123' })
        .expect(200)
        .expect((res) => {
          const body = res.body as { user?: unknown };
          expect(body.user).toBeDefined();
          expect(res.headers['set-cookie']).toBeDefined();
          expect(res.headers['set-cookie'][0]).toContain('access_token');
        });
    });

    it('should reject invalid credentials', () => {
      return request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'wrongpassword' })
        .expect(401)
        .expect((res) => {
          const body = res.body as { message?: string };
          expect(body.message).toBeDefined();
        });
    });

    it('should validate input format', () => {
      return request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: 'invalid', password: '' })
        .expect(400);
    });

    it('should apply rate limiting', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(getHttpServer())
          .post('/auth/login')
          .send({ cpf: '12345678900', password: 'wrong' }),
      );
      await Promise.all(promises);

      return request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'wrong' })
        .expect(429);
    });
  });

  describe('/auth/refresh (POST)', () => {
    it('should refresh access token', async () => {
      const loginRes = await request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'password123' });

      const cookies = loginRes.headers['set-cookie'] as string[];

      return request(getHttpServer())
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
      const loginRes = await request(getHttpServer())
        .post('/auth/login')
        .send({ cpf: '12345678900', password: 'password123' });

      const cookies = loginRes.headers['set-cookie'] as string[];

      return request(getHttpServer())
        .post('/auth/change-password')
        .set('Cookie', cookies)
        .send({ currentPassword: 'password123', newPassword: 'newpassword123' })
        .expect(200);
    });

    it('should reject unauthenticated request', () => {
      return request(getHttpServer())
        .post('/auth/change-password')
        .send({ currentPassword: 'password123', newPassword: 'newpassword123' })
        .expect(401);
    });
  });
});
