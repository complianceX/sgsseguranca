import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { AuthPrincipalService } from './auth-principal.service';
import { SecurityAuditService } from '../common/security/security-audit.service';

const TEST_SUPABASE_JWT_SECRET = [
  'supabase-secret-',
  '12345678901234567890',
].join('');

describe('AuthPrincipalService', () => {
  let service: AuthPrincipalService;
  let configService: { get: jest.Mock };
  let dataSource: {
    query: jest.Mock;
  };
  let securityAudit: {
    emit: jest.Mock;
    tenantMismatch: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') {
          return 'local-secret-123456789012345678901234';
        }
        if (key === 'SUPABASE_JWT_SECRET') {
          return TEST_SUPABASE_JWT_SECRET;
        }
        return undefined;
      }),
    };
    securityAudit = {
      emit: jest.fn(),
      tenantMismatch: jest.fn(),
    };

    service = new AuthPrincipalService(
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
      securityAudit as unknown as SecurityAuditService,
    );
  });

  it('resolve principal local sempre revalidando bridge no banco', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-1',
        auth_user_id: 'auth-user-1',
        cpf: '12345678900',
        company_id: 'company-1',
        site_id: 'site-1',
        profile_nome: 'Administrador Geral',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'app-user-1',
      app_user_id: 'app-user-1',
      auth_uid: 'auth-user-1',
      company_id: 'company-1',
      site_id: 'site-1',
      profile: { nome: 'Administrador Geral' },
      cpf: '12345678900',
    });

    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        authUserId: 'auth-user-1',
        companyId: 'company-1',
        isSuperAdmin: true,
      }),
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('resolve principal supabase via bridge auth_user_id -> public.users.id', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-1',
        auth_user_id: 'auth-user-1',
        cpf: '12345678900',
        company_id: 'company-1',
        profile_nome: 'Técnico',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'auth-user-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        authUserId: 'auth-user-1',
        companyId: 'company-1',
        profile: { nome: 'Técnico' },
        tokenSource: 'supabase',
      }),
    );
  });

  it('verifyAndResolveAccessToken aceita token assinado com segredo do supabase', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-77',
        auth_user_id: 'auth-user-77',
        cpf: '98765432100',
        company_id: 'company-77',
        profile_nome: 'Supervisor',
      },
    ]);

    const token = jwt.sign(
      {
        sub: 'auth-user-77',
        iss: 'https://project-ref.supabase.co/auth/v1',
        role: 'authenticated',
      },
      TEST_SUPABASE_JWT_SECRET,
    );

    const principal = await service.verifyAndResolveAccessToken(token);

    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-77',
        authUserId: 'auth-user-77',
        companyId: 'company-77',
      }),
    );
  });

  it('reusa o cache local do bridge para evitar nova query por auth_user_id', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-cache',
        auth_user_id: 'auth-user-cache',
        cpf: '98765432100',
        company_id: 'company-cache',
        profile_nome: 'Supervisor',
      },
    ]);

    const first = await service.resolveAccessPrincipal({
      sub: 'auth-user-cache',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });
    const second = await service.resolveAccessPrincipal({
      sub: 'auth-user-cache',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });

    expect(first.userId).toBe('app-user-cache');
    expect(second.userId).toBe('app-user-cache');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('bloqueia token com claim de tenant divergente e emite auditoria', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-tenant',
        auth_user_id: 'auth-user-tenant',
        cpf: '98765432100',
        company_id: 'company-db',
        site_id: 'site-db',
        profile_nome: 'Supervisor',
      },
    ]);

    await expect(
      service.resolveAccessPrincipal({
        sub: 'auth-user-tenant',
        iss: 'https://project-ref.supabase.co/auth/v1',
        role: 'authenticated',
        app_metadata: {
          app_user_id: 'app-user-tenant',
          company_id: 'company-token',
        },
      }),
    ).rejects.toThrow('Token inválido: divergência de contexto de acesso.');

    expect(securityAudit.emit).toHaveBeenCalled();
    expect(securityAudit.tenantMismatch).toHaveBeenCalledWith(
      'app-user-tenant',
      'company-db',
      'company-token',
    );
  });

  it('quando profile diverge, audita e usa profile do banco como fonte de verdade', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-profile',
        auth_user_id: 'auth-user-profile',
        cpf: '98765432100',
        company_id: 'company-1',
        site_id: 'site-1',
        profile_nome: 'Supervisor',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'auth-user-profile',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {
        app_user_id: 'app-user-profile',
        company_id: 'company-1',
        profile_name: 'Administrador Geral',
      },
    });

    expect(principal.profile).toEqual({ nome: 'Supervisor' });
    expect(principal.isSuperAdmin).toBe(false);
    expect(securityAudit.emit).toHaveBeenCalled();
  });

  it('deduplica lookups concorrentes do bridge', async () => {
    let resolveLookup:
      | ((value: Array<Record<string, unknown>>) => void)
      | undefined;
    dataSource.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );

    const firstPromise = service.resolveAccessPrincipal({
      sub: 'auth-user-race',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });
    const secondPromise = service.resolveAccessPrincipal({
      sub: 'auth-user-race',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });

    await Promise.resolve();
    await Promise.resolve();
    resolveLookup?.([
      {
        id: 'app-user-race',
        auth_user_id: 'auth-user-race',
        cpf: '98765432100',
        company_id: 'company-race',
        profile_nome: 'Supervisor',
      },
    ]);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.userId).toBe('app-user-race');
    expect(second.userId).toBe('app-user-race');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
