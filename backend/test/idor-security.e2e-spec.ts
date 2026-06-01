import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as cookieParserModule from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { PasswordService } from '../src/common/services/password.service';
import { Role } from '../src/auth/enums/roles.enum';
import {
  encryptSensitiveValue,
  hashSensitiveValue,
} from '../src/common/security/field-encryption.util';
import { bootstrapBackendTestEnvironment } from './setup/test-env';

bootstrapBackendTestEnvironment();

type App = Parameters<typeof request>[0];
type IdRow = { id: string };
type LoginResponse = { accessToken: string };
type CsrfBundle = { token: string; cookie: string };
type CookieParserFactory = (
  ...args: unknown[]
) => (req: unknown, res: unknown, next: () => void) => void;

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

const readFirstId = (rows: IdRow[], label: string): string => {
  const firstRow = rows[0];

  if (!firstRow?.id) {
    throw new Error(`Expected ${label} query to return an id`);
  }

  return firstRow.id;
};

const readAccessToken = (body: unknown): string => {
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof body.accessToken !== 'string'
  ) {
    throw new Error('Login response did not include a string accessToken');
  }

  return (body as LoginResponse).accessToken;
};

const sanitizeCookie = (
  rawCookies: string[] | undefined,
  cookieName: string,
): string => {
  if (!Array.isArray(rawCookies)) {
    return '';
  }

  const tokenCookie = rawCookies
    .filter((cookie) => cookie.startsWith(`${cookieName}=`))
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => cookie !== `${cookieName}=`)
    .at(-1);

  return tokenCookie ? tokenCookie.split(';')[0] : '';
};

const getCsrfBundle = async (httpServer: App): Promise<CsrfBundle> => {
  const response = await request(httpServer).get('/auth/csrf');
  const body = response.body as unknown as { csrfToken?: unknown };
  const token = typeof body.csrfToken === 'string' ? body.csrfToken.trim() : '';
  const cookie = sanitizeCookie(
    response.headers['set-cookie'] as string[] | undefined,
    'csrf-token',
  );

  if (!token || !cookie) {
    throw new Error(
      `Failed to bootstrap CSRF token. status=${response.status} body=${JSON.stringify(response.body)}`,
    );
  }

  return { token, cookie };
};

const resolveCookieParser = (): CookieParserFactory | null => {
  if (typeof cookieParserModule === 'function') {
    return cookieParserModule as unknown as CookieParserFactory;
  }

  const candidate = (
    cookieParserModule as unknown as { default?: CookieParserFactory }
  ).default;

  if (typeof candidate === 'function') {
    return candidate;
  }

  return null;
};

const isLocalTestDatabase = (): boolean => {
  const host = String(process.env.DATABASE_HOST || '');
  const database = String(process.env.DATABASE_NAME || '');
  return (
    ['localhost', '127.0.0.1', 'postgres-test', 'db-test'].includes(host) &&
    database === 'sst_test'
  );
};

const resetTestDatabase = async (dataSource: DataSource): Promise<void> => {
  if (dataSource.options.type === 'postgres' && isLocalTestDatabase()) {
    await dataSource.query(`DROP SCHEMA IF EXISTS "auth" CASCADE`);
    await dataSource.query(`DROP SCHEMA IF EXISTS "public" CASCADE`);
    await dataSource.query(`CREATE SCHEMA IF NOT EXISTS "public"`);
    await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await dataSource.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await dataSource.synchronize(false);
    return;
  }

  await dataSource.synchronize(true);
};

describeE2E('IDOR/BOLA Multi-Tenant (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let passwordService: PasswordService;

  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let tokenA: string;
  let adminGeralProfileId: string;
  let csrfBundle: CsrfBundle;
  const loginIp = `198.51.100.${Math.floor(Math.random() * 100) + 100}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const cookieParser = resolveCookieParser();
    if (cookieParser) {
      app.use(cookieParser());
    }
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    passwordService = moduleFixture.get(PasswordService);
    await resetTestDatabase(dataSource);
    csrfBundle = await getCsrfBundle(app.getHttpServer() as App);

    const getOrCreateProfileId = async (name: string): Promise<string> => {
      const existing = await dataSource.query<IdRow[]>(
        `SELECT id FROM profiles WHERE nome = $1 LIMIT 1`,
        [name],
      );
      if (existing[0]?.id) {
        return existing[0].id;
      }

      const created = await dataSource.query<IdRow[]>(
        `INSERT INTO profiles (id, nome, permissoes, status)
         VALUES (uuid_generate_v4(), $1, '{}'::jsonb, true)
         RETURNING id`,
        [name],
      );

      return readFirstId(created, `${name} profile`);
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
    const adminEmpresaProfileId = await getOrCreateProfileId(
      Role.ADMIN_EMPRESA,
    );
    adminGeralProfileId = await getOrCreateProfileId(Role.ADMIN_GERAL);

    // Empresas
    const companyA = await dataSource.query<IdRow[]>(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company A', $1, 'Rua 1', 'Resp A', true)
       RETURNING id`,
      [randomCnpj()],
    );
    const companyB = await dataSource.query<IdRow[]>(
      `INSERT INTO companies (id, razao_social, cnpj, endereco, responsavel, status)
       VALUES (uuid_generate_v4(), 'Company B', $1, 'Rua 2', 'Resp B', true)
       RETURNING id`,
      [randomCnpj()],
    );
    companyAId = readFirstId(companyA, 'company A');
    companyBId = readFirstId(companyB, 'company B');

    // Usuário A (Admin Empresa da Company A)
    const hashed = await passwordService.hash('Password@123');
    const cpfA = randomCpf();
    const cpfHashA = hashSensitiveValue(cpfA);
    const cpfCiphertextA = encryptSensitiveValue(cpfA);
    const emailA = `idor-a-${Date.now()}-${Math.floor(Math.random() * 10_000)}@test.com`;
    const userA = await dataSource.query<IdRow[]>(
      `INSERT INTO users (
          id, nome, cpf, cpf_hash, cpf_ciphertext, email, password, company_id, profile_id, status, module_access_keys
        )
       VALUES (
          uuid_generate_v4(), 'User A', NULL, $1, $2, $3, $4, $5, $6, true, '[]'::jsonb
       )
       RETURNING id`,
      [
        cpfHashA,
        cpfCiphertextA,
        emailA,
        hashed,
        companyAId,
        adminEmpresaProfileId,
      ],
    );
    userAId = readFirstId(userA, 'user A');

    // Login user A → accessToken
    const loginA = await request(app.getHttpServer() as App)
      .post('/auth/login')
      .set('x-forwarded-for', loginIp)
      .set('x-real-ip', loginIp)
      .set('x-csrf-token', csrfBundle.token)
      .set('Cookie', csrfBundle.cookie)
      .send({ cpf: cpfA, password: 'Password@123' });
    if (![200, 201].includes(loginA.status)) {
      throw new Error(
        `Login A failed status=${loginA.status} body=${JSON.stringify(loginA.body)}`,
      );
    }
    tokenA = readAccessToken(loginA.body);
    expect(typeof tokenA).toBe('string');
  });

  afterAll(async () => {
    await app.close();
    if (dataSource?.isInitialized) {
      await dataSource.destroy().catch(() => undefined);
    }
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
    await request(app.getHttpServer() as App)
      .patch(`/users/${userAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-csrf-token', csrfBundle.token)
      .set('Cookie', csrfBundle.cookie)
      .send({ profile_id: adminGeralProfileId })
      .expect(403);
  });

  it('Parameter tampering no /documents/import (empresaId divergente) deve retornar 403', async () => {
    await request(app.getHttpServer() as App)
      .post('/documents/import')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-csrf-token', csrfBundle.token)
      .set('Cookie', csrfBundle.cookie)
      .send({ empresaId: companyBId })
      .expect(403);
  });
});
