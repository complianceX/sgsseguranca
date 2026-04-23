/* eslint-disable @typescript-eslint/no-explicit-any */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { E2EHelper } from './helpers/e2e.helper';

type App = Parameters<typeof request>[0];

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('Multi-tenancy Isolation (e2e)', () => {
  let app: INestApplication;
  let company1Token: string;
  let company2Token: string;
  let company2UserId: string;

  beforeAll(async () => {
    app = await E2EHelper.createTestApp();

    // Usar dados de teste já existentes do seed
    // Para este teste, vamos assumir que temos usuários de empresas diferentes
    // já criados no seed do E2EHelper

    // Fazer login com usuários de empresas diferentes
    const loginRes1 = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: '12345678900', password: 'password123' });
    company1Token = loginRes1.headers['set-cookie'] as unknown as string;

    // Criar um segundo usuário para outra empresa via API
    const createUserRes = await request(app.getHttpServer() as App)
      .post('/users')
      .set('Cookie', company1Token)
      .send({
        nome: 'User Company 2',
        cpf: '55566677788',
        email: 'user2@company2.com',
        password: 'password123',
      });

    company2UserId = (createUserRes.body as { id: string }).id;

    // Fazer login com o segundo usuário
    const loginRes2 = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: '55566677788', password: 'password123' });
    company2Token = loginRes2.headers['set-cookie'] as unknown as string;
  });

  afterAll(async () => {
    await E2EHelper.cleanDatabase(app);
    await app.close();
  });

  it('should only see own company data', async () => {
    // Company 1 user lista usuários
    const res1 = await request(app.getHttpServer() as App)
      .get('/users')
      .set('Cookie', company1Token);

    expect(res1.status).toBe(200);
    const body1 = res1.body as { items?: any[] };
    const users1 = body1.items || (Array.isArray(body1) ? body1 : []);

    // Deve conter pelo menos o usuário original
    expect(users1.length).toBeGreaterThan(0);

    // Company 2 user lista usuários
    const res2 = await request(app.getHttpServer() as App)
      .get('/users')
      .set('Cookie', company2Token);

    expect(res2.status).toBe(200);
    const body2 = res2.body as { items?: any[] };
    const users2 = body2.items || (Array.isArray(body2) ? body2 : []);

    // Deve conter apenas o próprio usuário (isolamento)
    expect(users2.length).toBe(1);
    expect((users2[0] as { cpf: string }).cpf).toBe('55566677788');
  });

  it('should not access other company data', async () => {
    // Company 1 tenta acessar usuário da Company 2
    return request(app.getHttpServer() as App)
      .get(`/users/${company2UserId}`)
      .set('Cookie', company1Token)
      .expect(404); // Não encontrado (isolado)
  });

  it('should not update other company data', async () => {
    return request(app.getHttpServer() as App)
      .patch(`/users/${company2UserId}`)
      .set('Cookie', company1Token)
      .send({ nome: 'Hacked Name' })
      .expect(404);
  });

  it('should not delete other company data', async () => {
    return request(app.getHttpServer() as App)
      .delete(`/users/${company2UserId}`)
      .set('Cookie', company1Token)
      .expect(404);
  });
});
