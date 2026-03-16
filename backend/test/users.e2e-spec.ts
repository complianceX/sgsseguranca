import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2EHelper } from './helpers/e2e.helper';

type App = Parameters<typeof request>[0];

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('Users CRUD (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let createdUserId: string;

  beforeAll(async () => {
    app = await E2EHelper.createTestApp();
    await E2EHelper.seedDatabase(app);

    // Login como admin
    const res = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: 'admin-cpf', password: 'admin-pass' });

    authCookie = res.headers['set-cookie'] as unknown as string;
  });

  afterAll(async () => {
    await E2EHelper.cleanDatabase(app);
    await app.close();
  });

  describe('POST /users', () => {
    it('should create user', () => {
      return request(app.getHttpServer() as App)
        .post('/users')
        .set('Cookie', authCookie)
        .send({
          nome: 'New User',
          cpf: '98765432100',
          email: 'newuser@example.com',
          profile_id: 'profile-123',
          password: 'password123',
          company_id: 'company-123',
        })
        .expect(201)
        .expect((res: request.Response) => {
          const body = res.body as { id: string; nome: string };
          expect(body.id).toBeDefined();
          expect(body.nome).toBe('New User');
          createdUserId = body.id;
        });
    });

    it('should reject duplicate CPF', () => {
      return request(app.getHttpServer() as App)
        .post('/users')
        .set('Cookie', authCookie)
        .send({
          nome: 'Duplicate',
          cpf: '98765432100', // mesmo CPF
          email: 'dup@example.com',
          profile_id: 'profile-123',
          password: 'password123',
          company_id: 'company-123',
        })
        .expect(400)
        .expect((res: request.Response) => {
          // Check for specific error code if available, or just status
          // The filter might return standard error format
          const body = res.body as { statusCode: number };
          expect(body.statusCode).toBe(400);
        });
    });

    it('should validate required fields', () => {
      return request(app.getHttpServer() as App)
        .post('/users')
        .set('Cookie', authCookie)
        .send({
          // Missing fields
          nome: 'Invalid User',
        })
        .expect(400);
    });
  });

  describe('GET /users', () => {
    it('should return list of users', () => {
      return request(app.getHttpServer() as App)
        .get('/users')
        .set('Cookie', authCookie)
        .expect(200)
        .expect((res: request.Response) => {
          const body = res.body as { data: any[] };
          expect(Array.isArray(body.data)).toBe(true);
          expect(body.data.length).toBeGreaterThan(0);
        });
    });
  });

  describe('GET /users/:id', () => {
    it('should return a single user', () => {
      return request(app.getHttpServer() as App)
        .get(`/users/${createdUserId}`)
        .set('Cookie', authCookie)
        .expect(200)
        .expect((res: request.Response) => {
          const body = res.body as { id: string; nome: string };
          expect(body.id).toBe(createdUserId);
          expect(body.nome).toBe('New User');
        });
    });

    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer() as App)
        .get('/users/uuid-non-existent')
        .set('Cookie', authCookie)
        .expect(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update user', () => {
      return request(app.getHttpServer() as App)
        .patch(`/users/${createdUserId}`)
        .set('Cookie', authCookie)
        .send({
          nome: 'Updated User',
        })
        .expect(200)
        .expect((res: request.Response) => {
          const body = res.body as { nome: string };
          expect(body.nome).toBe('Updated User');
        });
    });
  });

  describe('DELETE /users/:id', () => {
    it('should delete user', () => {
      return request(app.getHttpServer() as App)
        .delete(`/users/${createdUserId}`)
        .set('Cookie', authCookie)
        .expect(200);
    });

    it('should return 404 when getting deleted user', () => {
      return request(app.getHttpServer() as App)
        .get(`/users/${createdUserId}`)
        .set('Cookie', authCookie)
        .expect(404);
    });
  });
});
