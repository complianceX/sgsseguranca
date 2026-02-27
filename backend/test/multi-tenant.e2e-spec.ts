import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

type App = Parameters<typeof request>[0];

describe('Multi-Tenant Isolation (APR) (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let cookieA: string;
  let cookieB: string;
  let cookieSuper: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get(DataSource);

    // Criar perfis mínimos
    const profile = await dataSource.query(
      `INSERT INTO profiles (id, nome, permissoes, status)
       VALUES (uuid_generate_v4(), 'Colaborador', '{}'::jsonb, true)
       RETURNING id`,
    );
    const profileId: string = profile[0].id;

    // Criar empresas
    const companyA = await dataSource.query(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company A', '12345678000199', 'Rua 1', 'Resp A', true)
       RETURNING id`,
    );
    const companyB = await dataSource.query(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company B', '98765432000188', 'Rua 2', 'Resp B', true)
       RETURNING id`,
    );

    const companyAId: string = companyA[0].id;
    const companyBId: string = companyB[0].id;

    // Criar sites
    const siteA = await dataSource.query(
      `INSERT INTO sites (id, nome, company_id, status)
       VALUES (uuid_generate_v4(), 'Site A', $1, true)
       RETURNING id`,
      [companyAId],
    );
    const siteB = await dataSource.query(
      `INSERT INTO sites (id, nome, company_id, status)
       VALUES (uuid_generate_v4(), 'Site B', $1, true)
       RETURNING id`,
      [companyBId],
    );
    const siteAId: string = siteA[0].id;
    const siteBId: string = siteB[0].id;

    // Criar usuários (CPFs válidos para passar validação de login)
    const userA = await dataSource.query(
      `INSERT INTO users (id, nome, cpf, email, password, company_id, profile_id, status)
       VALUES (uuid_generate_v4(), 'User A', '12345678909', 'a@test.com', 'hashed', $1, $2, true)
       RETURNING id`,
      [companyAId, profileId],
    );
    const userB = await dataSource.query(
      `INSERT INTO users (id, nome, cpf, email, password, company_id, profile_id, status)
       VALUES (uuid_generate_v4(), 'User B', '52998224725', 'b@test.com', 'hashed', $1, $2, true)
       RETURNING id`,
      [companyBId, profileId],
    );
    const userAId: string = userA[0].id;
    const userBId: string = userB[0].id;

    // Criar perfil de Super Admin
    const superAdminProfile = await dataSource.query(
      `INSERT INTO profiles (id, nome, permissoes, status)
       VALUES (uuid_generate_v4(), 'ADMIN_GERAL', '{}'::jsonb, true)
       RETURNING id`,
    );
    const superAdminProfileId: string = superAdminProfile[0].id;

    // Criar usuário Super Admin (sem empresa - global)
    const superAdminUser = await dataSource.query(
      `INSERT INTO users (id, nome, cpf, email, password, company_id, profile_id, status)
       VALUES (uuid_generate_v4(), 'Super Admin', '11111111111', 'super@test.com', 'hashed', NULL, $1, true)
       RETURNING id`,
      [superAdminProfileId],
    );
    const superAdminUserId: string = superAdminUser[0].id;

    // Criar APRs mínimas por empresa
    await dataSource.query(
      `INSERT INTO aprs (id, numero, titulo, descricao, data_inicio, data_fim, site_id, elaborador_id, company_id, status)
       VALUES (uuid_generate_v4(), 'APR-A-001', 'APR A', NULL, CURRENT_DATE, CURRENT_DATE, $1, $2, $3, 'Pendente')`,
      [siteAId, userAId, companyAId],
    );
    await dataSource.query(
      `INSERT INTO aprs (id, numero, titulo, descricao, data_inicio, data_fim, site_id, elaborador_id, company_id, status)
       VALUES (uuid_generate_v4(), 'APR-B-001', 'APR B', NULL, CURRENT_DATE, CURRENT_DATE, $1, $2, $3, 'Pendente')`,
      [siteBId, userBId, companyBId],
    );

    // Login para obter cookies
    const loginA = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: '12345678909', password: 'password123' });
    cookieA = (loginA.headers['set-cookie'] as unknown as string[]).join('; ');

    const loginB = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: '52998224725', password: 'password123' });
    cookieB = (loginB.headers['set-cookie'] as unknown as string[]).join('; ');

    const loginSuper = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: '11111111111', password: 'password123' });
    cookieSuper = (loginSuper.headers['set-cookie'] as unknown as string[]).join('; ');
  });

  afterAll(async () => {
    await app.close();
  });

  it('Empresa A não pode ver dados da Empresa B', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/aprs')
      .set('Cookie', cookieA);

    expect(response.status).toBe(200);
    const data = response.body as Array<{ titulo: string }>;
    // Deve retornar apenas 1 APR da empresa A
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].titulo).toBe('APR A');
  });

  it('Empresa B não pode ver dados da Empresa A', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/aprs')
      .set('Cookie', cookieB);

    expect(response.status).toBe(200);
    const data = response.body as Array<{ titulo: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].titulo).toBe('APR B');
  });

  it('Mesmo sem filtro manual, banco deve bloquear (sem tenant definido)', async () => {
    const raw = await dataSource.query(`SELECT * FROM aprs`);
    // RLS com deny_without_tenant e FORCE deve impedir leitura sem tenant
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBe(0);
  });

  it('Super Admin consegue ver todos os tenants (bypass RLS)', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/aprs')
      .set('Cookie', cookieSuper);

    expect(response.status).toBe(200);
    const data = response.body as Array<{ titulo: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data.some((apr) => apr.titulo === 'APR A')).toBe(true);
    expect(data.some((apr) => apr.titulo === 'APR B')).toBe(true);
  });
});
