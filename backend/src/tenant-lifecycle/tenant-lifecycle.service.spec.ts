import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import type { CompaniesService } from '../companies/companies.service';
import type { MailService } from '../mail/mail.service';
import type { PasswordService } from '../common/services/password.service';
import { Profile } from '../profiles/entities/profile.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../auth/enums/roles.enum';
import { TenantOnboardingInvite } from './entities/tenant-onboarding-invite.entity';
import { TenantLifecycleService } from './tenant-lifecycle.service';

type TestTransactionManager = {
  query: jest.Mock<Promise<void>, [string]>;
  findOne: jest.Mock<Promise<unknown>, [unknown, Record<string, unknown>?]>;
  create: jest.Mock<
    Record<string, unknown>,
    [unknown, Record<string, unknown>]
  >;
  save: jest.Mock<Promise<Record<string, unknown>>, [Record<string, unknown>]>;
};
type TestTransactionCallback = (manager: TestTransactionManager) => unknown;

describe('TenantLifecycleService', () => {
  const originalEncryptionEnv = {
    FIELD_ENCRYPTION_ENABLED: process.env.FIELD_ENCRYPTION_ENABLED,
    FIELD_ENCRYPTION_KEY: process.env.FIELD_ENCRYPTION_KEY,
    FIELD_ENCRYPTION_HASH_KEY: process.env.FIELD_ENCRYPTION_HASH_KEY,
  };

  const inviteRepository = {
    create: jest.fn((input: Partial<TenantOnboardingInvite>) => input),
    save: jest.fn((input: Partial<TenantOnboardingInvite>) =>
      Promise.resolve({
        id: 'invite-1',
        ...input,
      }),
    ),
    findOne: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string) =>
      key === 'FRONTEND_URL' ? 'https://app.sgs.test' : undefined,
    ),
  };

  const mailService = {
    sendMailSimple: jest.fn(() => Promise.resolve({})),
  };

  const passwordService = {
    validate: jest.fn(() => ({ valid: true, errors: [] })),
    hash: jest.fn(() => Promise.resolve('hashed-password')),
  };

  const companiesService = {
    ensureDefaultDdsThemeLibrary: jest.fn(() => Promise.resolve(undefined)),
  };

  const dataSource = {
    transaction: jest.fn(),
  };

  let service: TenantLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FIELD_ENCRYPTION_ENABLED = 'true';
    process.env.FIELD_ENCRYPTION_KEY = 'tenant-lifecycle-test-key-123456';
    process.env.FIELD_ENCRYPTION_HASH_KEY =
      'tenant-lifecycle-test-hash-key-123456';

    service = new TenantLifecycleService(
      inviteRepository as unknown as Repository<TenantOnboardingInvite>,
      dataSource as unknown as DataSource,
      configService as unknown as ConfigService,
      mailService as unknown as MailService,
      passwordService as unknown as PasswordService,
      companiesService as unknown as CompaniesService,
    );
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEncryptionEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('cria convite com URL publica de onboarding', async () => {
    const result = await service.createInvite({
      email: 'cliente@sgs.test',
      intended_company_name: 'Cliente SGS',
      expiresInDays: 7,
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'invite-1',
        email: 'cliente@sgs.test',
        intended_company_name: 'Cliente SGS',
      }),
    );
    expect(result.onboarding_url).toMatch(
      /^https:\/\/app\.sgs\.test\/onboarding\/[A-Za-z0-9_-]+$/,
    );
    expect(mailService.sendMailSimple).toHaveBeenCalledWith(
      'cliente@sgs.test',
      'Convite para teste do SGS',
      expect.stringContaining('/onboarding/'),
      undefined,
      undefined,
      expect.objectContaining({ filename: 'tenant-onboarding-invite' }),
    );
  });

  it('conclui onboarding publico criando empresa em trial, obra geral e admin', async () => {
    const invite: Partial<TenantOnboardingInvite> = {
      id: 'invite-1',
      email: 'admin@cliente.test',
      expires_at: new Date(Date.now() + 86_400_000),
      used_at: null,
      revoked_at: null,
    };
    const savedEntities: Record<string, unknown>[] = [];
    const manager: TestTransactionManager = {
      query: jest.fn(() => Promise.resolve(undefined)),
      findOne: jest.fn((entity: unknown) => {
        if (entity === TenantOnboardingInvite) {
          return Promise.resolve(invite);
        }
        if (entity === Company || entity === User) {
          return Promise.resolve(null);
        }
        if (entity === Profile) {
          return Promise.resolve({
            id: 'profile-admin',
            nome: Role.ADMIN_EMPRESA,
          });
        }
        return Promise.resolve(null);
      }),
      create: jest.fn(
        (_entity: unknown, input: Record<string, unknown>) => input,
      ),
      save: jest.fn((input: Record<string, unknown>) => {
        const entity = {
          id:
            input.id ??
            (input.razao_social
              ? 'company-1'
              : input.local
                ? 'site-1'
                : input.user_id && input.site_id
                  ? 'user-site-1'
                  : 'saved-1'),
          ...input,
        };
        savedEntities.push(entity);
        return Promise.resolve(entity);
      }),
    };
    const transactionMock = dataSource.transaction as jest.Mock<
      Promise<unknown>,
      [TestTransactionCallback]
    >;
    transactionMock.mockImplementation((callback) =>
      Promise.resolve(callback(manager)),
    );

    const result = await service.completeOnboarding('token-1', {
      razao_social: 'Cliente SGS LTDA',
      cnpj: '11222333000181',
      endereco: 'Rua Principal, 100',
      responsavel: 'Maria Cliente',
      email_contato: 'contato@cliente.test',
      admin_nome: 'Admin Cliente',
      admin_cpf: '52998224725',
      admin_email: 'admin@cliente.test',
      admin_password: 'SenhaForte123!',
      termsAccepted: true,
    });

    expect(manager.query).toHaveBeenCalledWith(
      "SET LOCAL app.is_super_admin = 'true'",
    );
    expect(result.company_id).toBe('company-1');
    expect(result.user_id).toEqual(expect.any(String));
    expect(invite.used_at).toBeInstanceOf(Date);
    expect(invite.created_company_id).toBe('company-1');
    expect(companiesService.ensureDefaultDdsThemeLibrary).toHaveBeenCalledWith(
      'company-1',
    );
    expect(savedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          razao_social: 'Cliente SGS LTDA',
          account_status: 'trialing',
          status: true,
        }),
        expect.objectContaining({
          nome: 'Geral',
          company_id: 'company-1',
          status: true,
        }),
        expect.objectContaining({
          nome: 'Admin Cliente',
          email: 'admin@cliente.test',
          cpf: null,
          profile_id: 'profile-admin',
          funcao: 'Administrador da Empresa',
        }),
      ]),
    );
  });
});
