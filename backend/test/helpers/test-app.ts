import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import * as cookieParserModule from 'cookie-parser';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { bootstrapBackendTestEnvironment } from '../setup/test-env';
import { Company } from '../../src/companies/entities/company.entity';
import { Site } from '../../src/sites/entities/site.entity';
import { Profile } from '../../src/profiles/entities/profile.entity';
import { User } from '../../src/users/entities/user.entity';
import { PasswordService } from '../../src/common/services/password.service';
import { Role } from '../../src/auth/enums/roles.enum';
import { RedisService } from '../../src/common/redis/redis.service';
import type { Redis } from 'ioredis';

bootstrapBackendTestEnvironment();

export type TenantKey = 'tenantA' | 'tenantB';

type SeedUserRecord = {
  id: string;
  cpf: string;
  email: string;
  role: Role;
  companyId: string;
};

type SeedTenant = {
  companyId: string;
  siteId: string;
  users: Record<string, SeedUserRecord>;
};

type CookieParserFactory = (
  ...args: unknown[]
) => (req: unknown, res: unknown, next: () => void) => void;

export type LoginSession = {
  accessToken: string;
  refreshCookie: string;
  refreshCsrfCookie: string;
  refreshCsrfToken: string;
  userId: string;
  role: Role;
  companyId: string;
};

const DEFAULT_PASSWORD = 'Password@123';

const PROFILE_NAMES: Role[] = [
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
  Role.TRABALHADOR,
];

function sanitizeCookie(rawCookies: string[] | undefined, cookieName: string) {
  if (!Array.isArray(rawCookies)) {
    return '';
  }
  const tokenCookie = rawCookies
    .filter((cookie) => cookie.startsWith(`${cookieName}=`))
    .map((cookie) => cookie.split(';')[0])
    .filter((cookie) => cookie !== `${cookieName}=`)
    .at(-1);
  return tokenCookie ? tokenCookie.split(';')[0] : '';
}

function resolveCookieParser(): CookieParserFactory | null {
  if (typeof cookieParserModule === 'function') {
    return cookieParserModule as unknown as CookieParserFactory;
  }

  const candidate = (
    cookieParserModule as unknown as {
      default?: CookieParserFactory;
    }
  ).default;

  if (typeof candidate === 'function') {
    return candidate;
  }

  return null;
}

export class TestApp {
  app: INestApplication;
  dataSource: DataSource;
  private companiesRepo: Repository<Company>;
  private sitesRepo: Repository<Site>;
  private profilesRepo: Repository<Profile>;
  private usersRepo: Repository<User>;
  private passwordService: PasswordService;
  private redisClient?: Redis;
  seed: Record<TenantKey, SeedTenant>;

  static async create(): Promise<TestApp> {
    const { AppModule } = await import('../../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    const cookieParser = resolveCookieParser();
    if (cookieParser) {
      app.use(cookieParser());
    }
    await app.init();

    const instance = new TestApp();
    instance.app = app;
    instance.dataSource = moduleFixture.get(DataSource);
    instance.companiesRepo = instance.dataSource.getRepository(Company);
    instance.sitesRepo = instance.dataSource.getRepository(Site);
    instance.profilesRepo = instance.dataSource.getRepository(Profile);
    instance.usersRepo = instance.dataSource.getRepository(User);
    instance.passwordService = moduleFixture.get(PasswordService);
    instance.redisClient = moduleFixture.get(RedisService).getClient();
    instance.seed = { tenantA: null as never, tenantB: null as never };

    await instance.resetDatabase();
    return instance;
  }

  request() {
    return request(this.app.getHttpServer() as Parameters<typeof request>[0]);
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  async resetDatabase(): Promise<void> {
    await this.resetRedisEphemeralState();

    const dbType = this.dataSource.options.type;
    if (dbType === 'postgres') {
      await this.dataSource.query(`
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
    } else {
      await this.dataSource.synchronize(true);
    }
    await this.seedBaseData();
  }

  private async resetRedisEphemeralState(): Promise<void> {
    if (!this.redisClient || process.env.NODE_ENV !== 'test') {
      return;
    }

    for (const pattern of ['throttle*', 'rate*']) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redisClient.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          250,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } while (cursor !== '0');
    }
  }

  getTenant(tenant: TenantKey): SeedTenant {
    return this.seed[tenant];
  }

  getUser(tenant: TenantKey, role: Role): SeedUserRecord {
    const tenantSeed = this.seed[tenant];
    const user = Object.values(tenantSeed.users).find(
      (item) => item.role === role,
    );
    if (!user) {
      throw new Error(`User not found for role=${role} tenant=${tenant}`);
    }
    return user;
  }

  async loginAs(role: Role, tenant: TenantKey): Promise<LoginSession> {
    const user = this.getUser(tenant, role);
    const csrfHeaders = await this.csrfHeaders();
    const response = await this.request()
      .post('/auth/login')
      .set(csrfHeaders)
      .send({ cpf: user.cpf, password: DEFAULT_PASSWORD });

    if (![200, 201].includes(response.status)) {
      throw new Error(
        `Failed login for role=${role} tenant=${tenant}. status=${response.status} body=${JSON.stringify(response.body)}`,
      );
    }

    const loginBody = response.body as {
      accessToken?: string;
      access_token?: string;
    };
    const accessToken = String(
      loginBody.accessToken || loginBody.access_token || '',
    );
    const refreshCookie = sanitizeCookie(
      response.headers['set-cookie'] as string[] | undefined,
      'refresh_token',
    );
    const refreshCsrfCookie = sanitizeCookie(
      response.headers['set-cookie'] as string[] | undefined,
      'refresh_csrf',
    );
    const refreshCsrfToken = refreshCsrfCookie.split('=').slice(1).join('=');

    if (!accessToken || !refreshCookie || !refreshCsrfCookie || !refreshCsrfToken) {
      throw new Error(
        'Login response missing accessToken/refresh cookie/refresh csrf token',
      );
    }

    return {
      accessToken,
      refreshCookie,
      refreshCsrfCookie,
      refreshCsrfToken,
      userId: user.id,
      role,
      companyId: user.companyId,
    };
  }

  authHeaders(
    session: LoginSession,
    options?: { companyIdOverride?: string },
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.accessToken}`,
      'x-company-id': options?.companyIdOverride || session.companyId,
    };
    return headers;
  }

  async csrfHeaders(): Promise<Record<string, string>> {
    const response = await this.request().get('/auth/csrf');
    const csrfToken = String(response.body?.csrfToken || '').trim();
    const csrfCookie =
      sanitizeCookie(
        response.headers['set-cookie'] as string[] | undefined,
        'csrf-token',
      ) || (csrfToken ? `csrf-token=${csrfToken}` : '');

    if (!csrfToken || !csrfCookie) {
      throw new Error(
        `Failed to bootstrap CSRF token. status=${response.status} body=${JSON.stringify(response.body)}`,
      );
    }

    return {
      'x-csrf-token': csrfToken,
      Cookie: csrfCookie,
    };
  }

  private async seedBaseData() {
    const profileMap = await this.seedProfiles();
    const passwordHash = await this.passwordService.hash(DEFAULT_PASSWORD);
    await this.ensureLocalSupabaseAuthStub();

    const companyA = await this.companiesRepo.save(
      this.companiesRepo.create({
        razao_social: 'Tenant A SST LTDA',
        cnpj: '11222333000181',
        endereco: 'Rua A, 100',
        responsavel: 'Resp A',
        status: true,
      }),
    );
    const companyB = await this.companiesRepo.save(
      this.companiesRepo.create({
        razao_social: 'Tenant B SST LTDA',
        cnpj: '44555666000151',
        endereco: 'Rua B, 200',
        responsavel: 'Resp B',
        status: true,
      }),
    );

    const siteA = await this.sitesRepo.save(
      this.sitesRepo.create({
        nome: 'Site A',
        company_id: companyA.id,
        status: true,
      }),
    );
    const siteB = await this.sitesRepo.save(
      this.sitesRepo.create({
        nome: 'Site B',
        company_id: companyB.id,
        status: true,
      }),
    );

    const usersTenantA = await this.seedTenantUsers({
      companyId: companyA.id,
      passwordHash,
      profileMap,
      suffix: 'a',
      cpfSeed: {
        adminGeral: '39053344705',
        admin: '52998224725',
        tst: '12345678909',
        worker: '11144477735',
      },
    });

    const usersTenantB = await this.seedTenantUsers({
      companyId: companyB.id,
      passwordHash,
      profileMap,
      suffix: 'b',
      cpfSeed: {
        adminGeral: '28625587887',
        admin: '15350946056',
        tst: '93541134780',
        worker: '29537914802',
      },
    });

    await this.upsertLocalSupabaseAuthUsers(
      [...Object.values(usersTenantA), ...Object.values(usersTenantB)],
      passwordHash,
    );

    this.seed = {
      tenantA: {
        companyId: companyA.id,
        siteId: siteA.id,
        users: usersTenantA,
      },
      tenantB: {
        companyId: companyB.id,
        siteId: siteB.id,
        users: usersTenantB,
      },
    };
  }

  private isLocalTestDatabase(): boolean {
    const host = String(
      this.dataSource.options.type === 'postgres'
        ? this.dataSource.options.host || ''
        : '',
    );
    return (
      process.env.NODE_ENV === 'test' &&
      ['127.0.0.1', 'localhost'].includes(host)
    );
  }

  private async ensureLocalSupabaseAuthStub(): Promise<void> {
    if (!this.isLocalTestDatabase()) {
      return;
    }

    await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "auth"`);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "auth"."users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" text NOT NULL UNIQUE,
        "encrypted_password" text,
        CONSTRAINT "PK_auth_users_id" PRIMARY KEY ("id")
      )
    `);
  }

  private async upsertLocalSupabaseAuthUsers(
    users: SeedUserRecord[],
    passwordHash: string,
  ): Promise<void> {
    if (!this.isLocalTestDatabase()) {
      return;
    }

    for (const user of users) {
      await this.dataSource.query(
        `
          INSERT INTO "auth"."users" ("email", "encrypted_password")
          VALUES ($1, $2)
          ON CONFLICT ("email")
          DO UPDATE SET "encrypted_password" = EXCLUDED."encrypted_password"
        `,
        [user.email, passwordHash],
      );
    }
  }

  private async seedProfiles(): Promise<Record<Role, Profile>> {
    const map = {} as Record<Role, Profile>;
    for (const roleName of PROFILE_NAMES) {
      const profile = await this.profilesRepo.save(
        this.profilesRepo.create({
          nome: roleName,
          permissoes: [],
          status: true,
        }),
      );
      map[roleName] = profile;
    }
    return map;
  }

  private async seedTenantUsers(input: {
    companyId: string;
    passwordHash: string;
    profileMap: Record<Role, Profile>;
    suffix: string;
    cpfSeed: {
      adminGeral: string;
      admin: string;
      tst: string;
      worker: string;
    };
  }): Promise<Record<string, SeedUserRecord>> {
    const adminGeral = await this.usersRepo.save(
      this.usersRepo.create({
        nome: `Admin Geral ${input.suffix.toUpperCase()}`,
        cpf: input.cpfSeed.adminGeral,
        email: `admin-geral-${input.suffix}@e2e.test`,
        password: input.passwordHash,
        company_id: input.companyId,
        profile_id: input.profileMap[Role.ADMIN_GERAL].id,
        status: true,
        ai_processing_consent: true,
      }),
    );

    const admin = await this.usersRepo.save(
      this.usersRepo.create({
        nome: `Admin ${input.suffix.toUpperCase()}`,
        cpf: input.cpfSeed.admin,
        email: `admin-${input.suffix}@e2e.test`,
        password: input.passwordHash,
        company_id: input.companyId,
        profile_id: input.profileMap[Role.ADMIN_EMPRESA].id,
        status: true,
        ai_processing_consent: true,
      }),
    );

    const tst = await this.usersRepo.save(
      this.usersRepo.create({
        nome: `Tecnico ${input.suffix.toUpperCase()}`,
        cpf: input.cpfSeed.tst,
        email: `tst-${input.suffix}@e2e.test`,
        password: input.passwordHash,
        company_id: input.companyId,
        profile_id: input.profileMap[Role.TST].id,
        status: true,
        ai_processing_consent: true,
      }),
    );

    const worker = await this.usersRepo.save(
      this.usersRepo.create({
        nome: `Trabalhador ${input.suffix.toUpperCase()}`,
        cpf: input.cpfSeed.worker,
        email: `worker-${input.suffix}@e2e.test`,
        password: input.passwordHash,
        company_id: input.companyId,
        profile_id: input.profileMap[Role.TRABALHADOR].id,
        status: true,
        ai_processing_consent: false,
      }),
    );

    return {
      adminGeral: {
        id: adminGeral.id,
        cpf: adminGeral.cpf as string,
        email: adminGeral.email,
        role: Role.ADMIN_GERAL,
        companyId: input.companyId,
      },
      admin: {
        id: admin.id,
        cpf: admin.cpf as string,
        email: admin.email,
        role: Role.ADMIN_EMPRESA,
        companyId: input.companyId,
      },
      tst: {
        id: tst.id,
        cpf: tst.cpf as string,
        email: tst.email,
        role: Role.TST,
        companyId: input.companyId,
      },
      worker: {
        id: worker.id,
        cpf: worker.cpf as string,
        email: worker.email,
        role: Role.TRABALHADOR,
        companyId: input.companyId,
      },
    };
  }
}
