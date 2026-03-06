import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/common/services/password.service';
import { Role } from '../src/auth/enums/roles.enum';

type App = Parameters<typeof request>[0];

describe('IDOR/BOLA Multi-Tenant (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordService: PasswordService;

  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let tokenA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    passwordService = moduleFixture.get(PasswordService);

    const getOrCreateProfileId = async (name: string) => {
      const existing = await dataSource.query(
        `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
        [name],
      );
      if (existing?.[0]?.id) return String(existing[0].id);

      const created = await dataSource.query(
        `INSERT INTO profiles (id, nome, permissoes, status)
         VALUES (uuid_generate_v4(), $1, '{}'::jsonb, true)
         RETURNING id`,
        [name],
      );
      return String(created[0].id);
    };

    const randomCnpj = () =>
      String(Math.floor(1e13 + Math.random() * 9e13)).padStart(14, '0');

    const randomCpf = () => {
      const n: number[] = Array.from({ length: 9 }, () =>
        Math.floor(Math.random() * 10),
      );
      const calc = (len: number) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += n[i] * (len + 1 - i);
        const mod = sum % 11;
        return mod < 2 ? 0 : 11 - mod;
      };
      n.push(calc(9));
      n.push(calc(10));
      return n.join('');
    };

    // Perfis (matching Role enum strings)
    const adminEmpresaProfileId = await getOrCreateProfileId(Role.ADMIN_EMPRESA);
    const adminGeralProfileId = await getOrCreateProfileId(Role.ADMIN_GERAL);

    // Empresas
    const companyA = await dataSource.query(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company A', $1, 'Rua 1', 'Resp A', true)
       RETURNING id`,
      [randomCnpj()],
    );
    const companyB = await dataSource.query(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company B', $1, 'Rua 2', 'Resp B', true)
       RETURNING id`,
      [randomCnpj()],
    );
    companyAId = companyA[0].id;
    companyBId = companyB[0].id;

    // Usuário A (Admin Empresa da Company A)
    const hashed = await passwordService.hash('Password@123');
    const cpfA = randomCpf();
    const userA = await dataSource.query(
      `INSERT INTO users (id, nome, cpf, email, password, company_id, profile_id, status)
       VALUES (uuid_generate_v4(), 'User A', $1, 'a@test.com', $2, $3, $4, true)
       RETURNING id`,
      [cpfA, hashed, companyAId, adminEmpresaProfileId],
    );
    userAId = userA[0].id;

    // Login user A → accessToken
    const loginA = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .send({ cpf: cpfA, password: 'Password@123' })
      .expect(201);
    tokenA = loginA.body?.accessToken;
    expect(typeof tokenA).toBe('string');

    // Guardar no contexto para ataques que precisam de IDs
    (global as any).__adminGeralProfileId = adminGeralProfileId;
  });

  afterAll(async () => {
    await app.close();
  });

  it('Empresa A não pode acessar /companies/{companyB} (BOLA)', async () => {
    await request(app.getHttpServer() as App)
      .get(`/companies/${companyBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      // Anti-oracle: rotas globais retornam 404 ao invés de 403 quando o recurso não pertence ao tenant
      .expect(404);
  });

  it('Tenant spoofing via x-company-id deve retornar 403', async () => {
    await request(app.getHttpServer() as App)
      .get('/users')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-company-id', companyBId)
      .expect(403);
  });

  it('Privilege escalation (promover para ADMIN_GERAL) deve retornar 403', async () => {
    const adminGeralProfileId = (global as any).__adminGeralProfileId as string;
    await request(app.getHttpServer() as App)
      .patch(`/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ profile_id: adminGeralProfileId })
      .expect(403);
  });

  it('Parameter tampering no /documents/import (empresaId divergente) deve retornar 403', async () => {
    await request(app.getHttpServer() as App)
      .post('/documents/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ empresaId: companyBId })
      .expect(403);
  });
});
